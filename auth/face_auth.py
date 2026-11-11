# auth/face_auth.py
# Fully offline, multi-user face authentication for Nova using OpenCV's LBPH
# recognizer, plus lightweight liveness checks (blink detection, head-turn
# challenge) to make a printed photo or a phone screen much harder to pass
# off as a real face. No network calls, no cloud face-ID service.
#
# Requires: opencv-contrib-python (provides cv2.face.LBPHFaceRecognizer_create)

import sys
import time
from pathlib import Path

_CV2_IMPORT_ERROR = None
try:
    import cv2
    import numpy as np
    _CV2_AVAILABLE = True
    _HAS_FACE_MODULE = hasattr(cv2, "face")
except Exception as exc:
    cv2 = None  # type: ignore[assignment]
    np = None  # type: ignore[assignment]
    _CV2_AVAILABLE = False
    _HAS_FACE_MODULE = False
    _CV2_IMPORT_ERROR = exc

from . import users as user_store


def _base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent.parent


MODEL_DIR = _base_dir() / "config" / "face_model"
MODEL_PATH = MODEL_DIR / "lbph_model.yml"
SAMPLES_DIR = _base_dir() / "config" / "face_samples"  # per-user raw grayscale crops (.npy)

_CASCADE_DIR = _base_dir() / "auth" / "cascades"  # bundled copies — don't depend on a possibly-broken cv2 install
_FACE_CASCADE_PATH = None
_EYE_CASCADE_PATH = None
if _CV2_AVAILABLE:
    _bundled_face = _CASCADE_DIR / "haarcascade_frontalface_default.xml"
    _bundled_eye = _CASCADE_DIR / "haarcascade_eye.xml"
    _FACE_CASCADE_PATH = str(_bundled_face) if _bundled_face.exists() else str(Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml")
    _EYE_CASCADE_PATH = str(_bundled_eye) if _bundled_eye.exists() else str(Path(cv2.data.haarcascades) / "haarcascade_eye.xml")


class FaceAuthUnavailable(Exception):
    pass


def is_available() -> bool:
    return _CV2_AVAILABLE and _HAS_FACE_MODULE


def unavailable_reason() -> str:
    if _CV2_AVAILABLE and _HAS_FACE_MODULE:
        return ""
    if not _CV2_AVAILABLE:
        if _CV2_IMPORT_ERROR is not None:
            return (
                f"OpenCV failed to import: {_CV2_IMPORT_ERROR}. "
                "Install opencv-contrib-python or fix your OpenCV installation."
            )
        return "OpenCV is not installed. Run: pip install opencv-contrib-python"
    return (
        "cv2.face is missing. Run: pip install opencv-contrib-python "
        "(plain opencv-python does not include the face module)."
    )


def is_model_trained() -> bool:
    return MODEL_PATH.exists()


def has_face_enrolled(username: str) -> bool:
    """True only once this user actually has stored face samples on disk —
    unlike users.get_face_label(), which is a numeric slot assigned at
    account creation and is never None, enrolled or not."""
    return (SAMPLES_DIR / f"{username}.npy").exists()


def _require_cv2():
    if not _CV2_AVAILABLE:
        raise FaceAuthUnavailable(unavailable_reason())
    if not _HAS_FACE_MODULE or not hasattr(cv2.face, "LBPHFaceRecognizer_create"):
        raise FaceAuthUnavailable(
            "cv2.face or LBPHFaceRecognizer_create is unavailable. "
            "Run: pip install opencv-contrib-python"
        )


def _load_cascade(primary_path, filename):
    candidates = []
    if primary_path:
        candidates.append(Path(primary_path))
    candidates.append(_CASCADE_DIR / filename)
    try:
        cv2_dir = Path(cv2.__file__).resolve().parent
        candidates.append(cv2_dir / "data" / filename)
    except Exception:
        pass
    for path in candidates:
        if path.exists():
            clf = cv2.CascadeClassifier(str(path))
            if not clf.empty():
                return clf
    raise FaceAuthUnavailable(
        f"Could not load Haar cascade '{filename}'. Checked: "
        f"{', '.join(str(c) for c in candidates) or '(no paths found)'}. "
        "Your OpenCV install is missing its data files — reinstall with:\n"
        "    pip uninstall -y opencv-python opencv-contrib-python opencv-python-headless\n"
        "    pip install opencv-contrib-python"
    )


def get_detector():
    _require_cv2()
    return _load_cascade(_FACE_CASCADE_PATH, "haarcascade_frontalface_default.xml")


def get_eye_detector():
    _require_cv2()
    return _load_cascade(_EYE_CASCADE_PATH, "haarcascade_eye.xml")


def get_recognizer():
    """Loads the trained multi-user LBPH model, or None if nothing is trained yet."""
    _require_cv2()
    if not is_model_trained():
        return None
    recognizer = cv2.face.LBPHFaceRecognizer_create()
    recognizer.read(str(MODEL_PATH))
    return recognizer


# ---------------------------------------------------------------- enrollment

def save_user_samples(username: str, samples: list) -> None:
    """Appends newly captured grayscale face crops (200x200) for a user and
    retrains the shared multi-user model from everything stored on disk."""
    _require_cv2()
    if len(samples) < 5:
        raise RuntimeError(
            f"Only {len(samples)} usable face samples were collected. "
            "Make sure your face is well lit and centered, then try again."
        )
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    path = SAMPLES_DIR / f"{username}.npy"
    stacked = np.stack(samples).astype(np.uint8)
    if path.exists():
        existing = np.load(path)
        stacked = np.concatenate([existing, stacked], axis=0)
    np.save(path, stacked)
    retrain_all()


def retrain_all() -> None:
    """Rebuilds the shared LBPH model from every enrolled user's stored samples."""
    _require_cv2()
    all_samples, all_labels = [], []
    for npy_file in SAMPLES_DIR.glob("*.npy"):
        username = npy_file.stem
        label = user_store.get_face_label(username)
        if label is None:
            continue
        arr = np.load(npy_file)
        for frame in arr:
            all_samples.append(frame)
            all_labels.append(label)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if not all_samples:
        if MODEL_PATH.exists():
            MODEL_PATH.unlink()
        return

    recognizer = cv2.face.LBPHFaceRecognizer_create()
    recognizer.train(all_samples, np.array(all_labels))
    recognizer.write(str(MODEL_PATH))


def remove_user_samples(username: str) -> None:
    path = SAMPLES_DIR / f"{username}.npy"
    if path.exists():
        path.unlink()
    retrain_all()


# ---------------------------------------------------------------- matching

def match_frame(gray_frame, recognizer, detector, confidence_threshold: float = 65.0):
    """
    Runs detection + recognition on one grayscale frame.
    Returns (username_or_None, face_box (x,y,w,h) | None).
    """
    faces = detector.detectMultiScale(gray_frame, scaleFactor=1.2, minNeighbors=5, minSize=(80, 80))
    for (x, y, w, h) in faces:
        face = cv2.resize(gray_frame[y:y + h, x:x + w], (200, 200))
        if recognizer is not None:
            label, confidence = recognizer.predict(face)
            if confidence <= confidence_threshold:
                uname = user_store.username_for_face_label(label)
                if uname:
                    return uname, (x, y, w, h)
        return None, (x, y, w, h)  # a face is present, but unrecognized -> "unknown visitor"
    return None, None  # no face in frame at all


# ---------------------------------------------------------------- liveness: blink

class BlinkDetector:
    """
    Heuristic liveness check: tracks whether eyes are detected inside the
    face box across frames. A real blink shows up as eyes-detected ->
    eyes-not-detected -> eyes-detected within a short window. A static photo
    or a paused video frame never produces that transition.
    """
    def __init__(self, eye_detector, required_blinks: int = 1, window_s: float = 12.0):
        self._eye_detector = eye_detector
        self._required = required_blinks
        self._window_s = window_s
        self._blinks = 0
        self._eyes_open_prev = True
        self._start = time.time()

    def reset(self):
        self._blinks = 0
        self._eyes_open_prev = True
        self._start = time.time()

    def feed(self, gray_frame, face_box) -> bool:
        """Call once per frame with the current face box. Returns True once
        enough blinks have been observed."""
        if face_box is None:
            return self._blinks >= self._required
        x, y, w, h = face_box
        roi = gray_frame[y:y + h // 2, x:x + w]  # eyes are in the upper half of the face
        eyes = self._eye_detector.detectMultiScale(roi, scaleFactor=1.1, minNeighbors=6, minSize=(15, 15))
        eyes_open_now = len(eyes) >= 1

        if self._eyes_open_prev and not eyes_open_now:
            pass  # transition to closed — wait for reopen to count a full blink
        elif (not self._eyes_open_prev) and eyes_open_now:
            self._blinks += 1

        self._eyes_open_prev = eyes_open_now
        return self._blinks >= self._required

    def timed_out(self) -> bool:
        return (time.time() - self._start) > self._window_s


# ---------------------------------------------------------------- liveness: head-turn challenge

import random

HEAD_CHALLENGES = [
    ("turn_left",  "Please turn your head slightly LEFT"),
    ("turn_right", "Please turn your head slightly RIGHT"),
    ("look_up",    "Please tilt your head UP"),
    ("look_down",  "Please tilt your head DOWN"),
]


class HeadChallenge:
    """
    Picks a random direction and checks that the detected face box's center
    moves in that direction relative to a short baseline — defeats a static
    photo/video-loop spoof that can't respond to an unpredictable instruction.
    """
    def __init__(self, min_shift_px: int = 18, baseline_frames: int = 6, window_s: float = 10.0):
        self.direction, self.prompt = random.choice(HEAD_CHALLENGES)
        self._min_shift = min_shift_px
        self._baseline_frames = baseline_frames
        self._baseline_pts = []
        self._start = time.time()
        self._window_s = window_s

    def feed(self, face_box) -> bool:
        if face_box is None:
            return False
        x, y, w, h = face_box
        cx, cy = x + w / 2, y + h / 2

        if len(self._baseline_pts) < self._baseline_frames:
            self._baseline_pts.append((cx, cy))
            return False

        base_x = sum(p[0] for p in self._baseline_pts) / len(self._baseline_pts)
        base_y = sum(p[1] for p in self._baseline_pts) / len(self._baseline_pts)
        dx, dy = cx - base_x, cy - base_y

        if self.direction == "turn_left" and dx < -self._min_shift:
            return True
        if self.direction == "turn_right" and dx > self._min_shift:
            return True
        if self.direction == "look_up" and dy < -self._min_shift:
            return True
        if self.direction == "look_down" and dy > self._min_shift:
            return True
        return False

    def timed_out(self) -> bool:
        return (time.time() - self._start) > self._window_s
