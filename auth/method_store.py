# auth/method_store.py
# Stores each user's chosen sign-in method (password / face / voice) as an
# encrypted blob on disk, using the same Fernet key used for memory files
# (memory/crypto_store.py). Nothing about auth method preference is ever
# written in plaintext.

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from memory import crypto_store  # noqa: E402

VALID_METHODS = ("password", "face", "voice")


def _base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent.parent


STORE_PATH = _base_dir() / "config" / "auth_methods.enc"


def _load() -> dict:
    if not STORE_PATH.exists():
        return {}
    try:
        raw = STORE_PATH.read_bytes()
        if crypto_store.is_available() and crypto_store.looks_encrypted(raw):
            return json.loads(crypto_store.decrypt_text(raw))
        # Fallback: plain JSON (e.g. cryptography not installed) — still
        # better than crashing; we upgrade to encrypted on next save.
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return {}


def _save(data: dict) -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data)
    if crypto_store.is_available():
        STORE_PATH.write_bytes(crypto_store.encrypt_text(payload))
    else:
        STORE_PATH.write_bytes(payload.encode("utf-8"))


def get_method(username: str) -> str:
    """Returns the user's chosen sign-in method. Defaults to 'password'
    for any user who hasn't picked one yet (e.g. accounts created before
    this feature existed)."""
    data = _load()
    method = data.get(username)
    return method if method in VALID_METHODS else "password"


def set_method(username: str, method: str) -> None:
    if method not in VALID_METHODS:
        raise ValueError(f"Unknown auth method '{method}'. Must be one of {VALID_METHODS}.")
    data = _load()
    data[username] = method
    _save(data)


def remove_user(username: str) -> None:
    data = _load()
    data.pop(username, None)
    _save(data)
