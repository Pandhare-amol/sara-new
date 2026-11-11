# auth/users.py
# Multi-user account registry for Nova. Fully offline — plain local JSON
# plus a salted PBKDF2-SHA256 hash per user. Never stores plaintext passwords.

import hashlib
import hmac
import json
import os
import sys
import time
from pathlib import Path

_ITERATIONS = 200_000
_HASH_NAME = "sha256"


def _base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent.parent


USERS_DIR = _base_dir() / "config"
USERS_FILE = USERS_DIR / "auth_users.json"


def _load() -> dict:
    if not USERS_FILE.exists():
        return {"users": {}, "next_label": 1}
    try:
        return json.loads(USERS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"users": {}, "next_label": 1}


def _save(data: dict) -> None:
    USERS_DIR.mkdir(parents=True, exist_ok=True)
    USERS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _hash_pw(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac(_HASH_NAME, password.encode("utf-8"), salt, _ITERATIONS).hex()


def list_users() -> list:
    """Returns [{username, role, has_face, has_voice, face_label}, ...]"""
    data = _load()
    out = []
    for uname, u in data["users"].items():
        out.append({
            "username": uname,
            "role": u.get("role", "user"),
            "has_face": bool(u.get("face_label") is not None),
            "has_voice": bool(u.get("has_voice")),
            "face_label": u.get("face_label"),
        })
    return out


def user_exists(username: str) -> bool:
    return username in _load()["users"]


def any_users_exist() -> bool:
    return bool(_load()["users"])


def add_user(username: str, password: str, role: str = "user") -> None:
    if not username or not password or len(password) < 4:
        raise ValueError("Username and a password (min 4 chars) are required.")
    data = _load()
    if username in data["users"]:
        raise ValueError(f"User '{username}' already exists.")

    salt = os.urandom(16)
    label = data.get("next_label", 1)
    data["users"][username] = {
        "password_hash": _hash_pw(password, salt),
        "salt": salt.hex(),
        "iterations": _ITERATIONS,
        "role": role,
        "face_label": label,     # numeric label used inside the shared LBPH model
        "has_voice": False,
        "created_at": time.time(),
    }
    data["next_label"] = label + 1
    _save(data)


def remove_user(username: str) -> None:
    data = _load()
    data["users"].pop(username, None)
    _save(data)


def verify_password(username: str, password: str) -> bool:
    data = _load()
    u = data["users"].get(username)
    if not u:
        return False
    salt = bytes.fromhex(u["salt"])
    attempt = _hash_pw(password, salt)
    return hmac.compare_digest(attempt, u["password_hash"])


def get_face_label(username: str):
    data = _load()
    u = data["users"].get(username)
    return u.get("face_label") if u else None


def username_for_face_label(label: int):
    data = _load()
    for uname, u in data["users"].items():
        if u.get("face_label") == label:
            return uname
    return None


def mark_voice_enrolled(username: str, enrolled: bool = True) -> None:
    data = _load()
    if username in data["users"]:
        data["users"][username]["has_voice"] = enrolled
        _save(data)


def has_voice(username: str) -> bool:
    data = _load()
    u = data["users"].get(username)
    return bool(u and u.get("has_voice"))


def owner_username():
    """Returns the first-created (owner) user, if any — used for default single-user flows."""
    data = _load()
    if not data["users"]:
        return None
    return min(data["users"].items(), key=lambda kv: kv[1].get("created_at", 0))[0]
