import os
import sys
import json
from pathlib import Path
from typing import Dict, Any, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from config.settings import INSTAGRAM_CREDENTIALS_FILE, TEMP_DIR

class InstagramUploader:
    def __init__(self, config_file: Optional[Path] = None):
        self.config_file = config_file or INSTAGRAM_CREDENTIALS_FILE
        self.client = None

    def _load_credentials(self) -> Optional[Dict[str, str]]:
        if self.config_file.exists():
            try:
                with open(self.config_file, "r") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[Instagram] Error reading credentials: {e}")
        return None

    def upload_reel(
        self,
        video_path: str,
        caption: str,
        thumbnail_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Uploads a 9:16 vertical video as an Instagram Reel.
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")

        creds = self._load_credentials()
        if not creds or not creds.get("username") or not creds.get("password"):
            print(f"\n[Instagram] Note: Credentials not configured in {self.config_file}.")
            print("[Instagram] Setup instructions:")
            print("  Create 'config/instagram_config.json' with:")
            print('  { "username": "your_handle", "password": "your_password" }\n')
            return {
                "success": False,
                "simulated": True,
                "message": "Video saved locally. Add your Instagram credentials to config/instagram_config.json for direct auto-posting."
            }

        try:
            from instagrapi import Client
            cl = Client()
            session_file = TEMP_DIR / "instagram_session.json"
            
            # Use cached session if available to avoid challenge/verification requests
            logged_in = False
            if session_file.exists():
                try:
                    cl.load_settings(str(session_file))
                    cl.login(creds["username"], creds["password"])
                    logged_in = True
                except Exception:
                    logged_in = False

            if not logged_in:
                cl.login(creds["username"], creds["password"])
                cl.dump_settings(str(session_file))

            print(f"[Instagram] Uploading Reel: '{caption[:50]}...'")
            media = cl.clip_upload(
                path=video_path,
                caption=caption,
                thumbnail=thumbnail_path
            )

            media_id = getattr(media, "pk", str(media))
            print(f"[Instagram] Reel uploaded successfully! Media ID: {media_id}")
            return {
                "success": True,
                "media_id": media_id,
                "message": "Reel successfully uploaded to Instagram."
            }

        except Exception as e:
            print(f"[Instagram] Upload error: {e}")
            return {
                "success": False,
                "error": str(e)
            }

if __name__ == "__main__":
    uploader = InstagramUploader()
    print("InstagramUploader module initialized.")
