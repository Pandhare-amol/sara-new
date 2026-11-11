# auth/voice_auth.py
# Lightweight, fully offline voice-print second factor for Nova.
#
# Honest caveat: this is a heuristic MFCC-similarity check, not a
# production-grade speaker-verification model (like a trained d-vector/
# ECAPA-TDNN system). It adds a real extra hurdle against someone who only
# has your password, but a good recording/impression of your voice could
# still fool it. Treat it as a second factor, not a sole credential.

import sys
from pathlib import Path

import numpy as np

try:
    import sounddevice as sd
    _SOUNDDEVICE_AVAILABLE = True
except Exception:
    # Broken PortAudio installs raise OSError (not ImportError) here on
    # some systems — catch broadly so a missing native audio backend
    # only disables voice auth, it never takes down the rest of Nova
    # (this module gets imported at process startup by bridge.py).
    _SOUNDDEVICE_AVAILABLE = False

try:
    import librosa
    _LIBROSA_AVAILABLE = True
except ImportError:
    _LIBROSA_AVAILABLE = False


def _base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent.parent


VOICE_DIR = _base_dir() / "config" / "voice_prints"
SAMPLE_RATE = 16000
DURATION_S = 3.0
MATCH_THRESHOLD = 0.86  # cosine similarity


def is_available() -> bool:
    return _LIBROSA_AVAILABLE and _SOUNDDEVICE_AVAILABLE


def unavailable_reason() -> str:
    """Human-readable explanation for why voice auth can't run right now,
    used by the UI/API layer instead of guessing which dependency failed."""
    missing = []
    if not _SOUNDDEVICE_AVAILABLE:
        missing.append("microphone access (sounddevice/PortAudio failed to load)")
    if not _LIBROSA_AVAILABLE:
        missing.append("librosa (pip install librosa)")
    return "Voice auth unavailable: " + "; ".join(missing) if missing else ""


def _record(duration_s: float = DURATION_S) -> np.ndarray:
    if not _SOUNDDEVICE_AVAILABLE:
        raise RuntimeError(
            "Microphone recording is unavailable (sounddevice/PortAudio failed to load). "
            "Reinstall PortAudio for your OS, then pip install --force-reinstall sounddevice."
        )
    audio = sd.rec(int(duration_s * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=1, dtype="float32")
    sd.wait()
    return audio.flatten()


def _extract_features(audio: np.ndarray) -> np.ndarray:
    """13 MFCCs, mean + std pooled across time -> a fixed-length voiceprint vector."""
    if not _LIBROSA_AVAILABLE:
        raise RuntimeError("librosa is not installed. Run: pip install librosa")
    mfcc = librosa.feature.mfcc(y=audio, sr=SAMPLE_RATE, n_mfcc=13)
    return np.concatenate([mfcc.mean(axis=1), mfcc.std(axis=1)])


def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / ((np.linalg.norm(a) * np.linalg.norm(b)) + 1e-8))


def enroll_voice(username: str, phrase_hint: str = "Say a short sentence in your normal voice") -> str:
    """Records a short clip and stores the voiceprint vector for this user."""
    audio = _record()
    vec = _extract_features(audio)
    VOICE_DIR.mkdir(parents=True, exist_ok=True)
    np.save(VOICE_DIR / f"{username}.npy", vec)
    return "Voice enrolled."


def record_and_extract() -> np.ndarray:
    """Exposed separately so a UI can show 'listening...' state while this runs
    on a background thread, then compare the result against one or more users."""
    return _extract_features(_record())


def verify_against(username: str, vec: np.ndarray) -> bool:
    path = VOICE_DIR / f"{username}.npy"
    if not path.exists():
        return False
    stored = np.load(path)
    return _cosine_sim(stored, vec) >= MATCH_THRESHOLD


def remove_voice(username: str) -> None:
    path = VOICE_DIR / f"{username}.npy"
    if path.exists():
        path.unlink()
