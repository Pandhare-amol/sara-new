"""
Local Biometric Enrollment Helper (320x240 Grayscale + LBPH / Histogram Signature)
Stores biometric signature strictly on local disk (DATA_DIR/biometrics) — zero cloud or Supabase.
"""

from __future__ import annotations

import json
import os
from typing import List, Optional


def compute_histogram_signature(gray_pixels: List[int], bins: int = 32) -> List[float]:
    """Lightweight CPU-only normalized intensity histogram (runs in <1ms, zero GPU VRAM)."""
    if not gray_pixels:
        return [0.0] * bins
    hist = [0] * bins
    for val in gray_pixels:
        clamped = max(0, min(255, int(val)))
        idx = min(bins - 1, (clamped * bins) // 256)
        hist[idx] += 1
    total = float(len(gray_pixels))
    return [round(c / total, 6) for c in hist]


def enroll_owner_from_samples(
    samples: List[List[int]],
    output_dir: str = "data/biometrics",
) -> dict:
    """Enrolls owner locally from grayscale sample arrays (supports headless & webcam modes)."""
    os.makedirs(output_dir, exist_ok=True)
    sig_path = os.path.join(output_dir, "owner_signature.json")
    if not samples:
        raise ValueError("At least one grayscale face sample is required for enrollment.")

    histograms = [compute_histogram_signature(s) for s in samples]
    bins = len(histograms[0])
    centroid = [
        round(sum(h[i] for h in histograms) / len(histograms), 6)
        for i in range(bins)
    ]
    payload = {
        "version": 1,
        "label": 1,
        "sampleCount": len(samples),
        "bins": bins,
        "centroid": centroid,
    }
    with open(sig_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
    return {"ok": True, "signaturePath": sig_path, "sampleCount": len(samples)}


def enroll_owner_webcam(output_dir: str = "data/biometrics", sample_count: int = 40) -> dict:
    """Captures 320x240 grayscale webcam samples and trains local LBPH + histogram signature."""
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
    except ImportError as exc:
        return {"ok": False, "error": f"OpenCV not installed ({exc}). Use API sample enrollment or install opencv-contrib-python."}

    os.makedirs(output_dir, exist_ok=True)
    model_path = os.path.join(output_dir, "owner_model.yml")
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(cascade_path)

    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 320)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 240)
    if not cap.isOpened():
        return {"ok": False, "error": "Webcam index 0 unavailable."}

    faces_data = []
    flat_samples: List[List[int]] = []
    labels: List[int] = []
    attempts = 0
    max_attempts = sample_count * 10

    while len(faces_data) < sample_count and attempts < max_attempts:
        attempts += 1
        ret, frame = cap.read()
        if not ret:
            continue
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        detected = face_cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5, minSize=(40, 40))
        for (x, y, w, h) in detected:
            roi = cv2.resize(gray[y : y + h, x : x + w], (100, 100))
            faces_data.append(roi)
            flat_samples.append(roi.flatten().tolist())
            labels.append(1)
            break

    cap.release()
    if not faces_data:
        return {"ok": False, "error": "No faces captured during webcam enrollment."}

    hist_res = enroll_owner_from_samples(flat_samples, output_dir=output_dir)
    lbph_saved: Optional[str] = None
    if hasattr(cv2, "face") and hasattr(cv2.face, "LBPHFaceRecognizer_create"):
        recognizer = cv2.face.LBPHFaceRecognizer_create(radius=1, neighbors=8, grid_x=8, grid_y=8)
        recognizer.train(faces_data, np.array(labels))
        recognizer.save(model_path)
        lbph_saved = model_path

    return {
        "ok": True,
        "sampleCount": len(faces_data),
        "lbphModelPath": lbph_saved,
        "signaturePath": hist_res["signaturePath"],
    }


if __name__ == "__main__":
    print(enroll_owner_webcam())
