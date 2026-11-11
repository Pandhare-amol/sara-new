import os
import sys
import pickle
from pathlib import Path
from typing import Dict, List, Any, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from config.settings import YOUTUBE_CLIENT_SECRETS_FILE, YOUTUBE_TOKEN_FILE

# Scopes needed to upload videos to YouTube
YOUTUBE_SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube"
]

class YouTubeUploader:
    def __init__(self, secrets_file: Optional[Path] = None):
        self.secrets_file = secrets_file or YOUTUBE_CLIENT_SECRETS_FILE
        self.token_file = YOUTUBE_TOKEN_FILE
        self.youtube = None

    def authenticate(self) -> bool:
        """
        Authenticates with YouTube Data API v3.
        Stores credentials in youtube_token.pickle so authentication only happens once.
        """
        creds = None
        if self.token_file.exists():
            try:
                with open(self.token_file, "rb") as token:
                    creds = pickle.load(token)
            except Exception as e:
                print(f"[YouTube] Could not read token cache: {e}")

        # If there are no valid cached credentials
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                try:
                    creds.refresh(Request())
                except Exception:
                    creds = None
            
            if not creds:
                if not self.secrets_file.exists():
                    print(f"\n[YouTube] Note: {self.secrets_file} not found.")
                    print("[YouTube] Setup instructions:")
                    print("  1. Go to https://console.cloud.google.com")
                    print("  2. Create a free project & enable 'YouTube Data API v3'")
                    print("  3. Create OAuth 2.0 Client ID (Desktop App) & download JSON")
                    print(f"  4. Save it as: {self.secrets_file}\n")
                    return False

                flow = InstalledAppFlow.from_client_secrets_file(
                    str(self.secrets_file), YOUTUBE_SCOPES
                )
                creds = flow.run_local_server(port=0)

            # Save token for future runs
            with open(self.token_file, "wb") as token:
                pickle.dump(creds, token)

        try:
            self.youtube = build("youtube", "v3", credentials=creds)
            return True
        except Exception as e:
            print(f"[YouTube] API build error: {e}")
            return False

    def upload_video(
        self,
        video_path: str,
        title: str,
        description: str,
        tags: List[str],
        category_id: str = "28",  # 28 = Science & Technology, 24 = Entertainment
        privacy_status: str = "public",  # public, unlisted, private
        thumbnail_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Uploads a video to YouTube with title, description, tags, and category.
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")

        # Check authentication
        if not self.authenticate():
            print("[YouTube] Automated upload simulated (credentials missing).")
            print(f"  Title: {title}")
            print(f"  Video: {video_path}")
            print(f"  Privacy: {privacy_status}")
            return {
                "success": False,
                "simulated": True,
                "message": "Saved video locally. To enable 1-click auto-upload, add client_secrets.json to config folder."
            }

        body = {
            "snippet": {
                "title": title[:100],  # YouTube max title length
                "description": description,
                "tags": tags,
                "categoryId": category_id
            },
            "status": {
                "privacyStatus": privacy_status,
                "selfDeclaredMadeForKids": False
            }
        }

        media = MediaFileUpload(
            video_path,
            chunksize=1024*1024*4,  # 4MB chunks
            resumable=True
        )

        request = self.youtube.videos().insert(
            part=",".join(body.keys()),
            body=body,
            media_body=media
        )

        print(f"[YouTube] Uploading '{title}'...")
        response = None
        while response is None:
            status, response = request.next_chunk()
            if status:
                progress = int(status.progress() * 100)
                print(f"[YouTube] Upload progress: {progress}%")

        video_id = response.get("id")
        video_url = f"https://youtu.be/{video_id}"
        print(f"[YouTube] Upload successful! URL: {video_url}")

        # Upload custom thumbnail if provided
        if thumbnail_path and os.path.exists(thumbnail_path):
            try:
                self.youtube.thumbnails().set(
                    videoId=video_id,
                    media_body=MediaFileUpload(thumbnail_path)
                ).execute()
                print("[YouTube] Custom thumbnail uploaded successfully.")
            except Exception as e:
                print(f"[YouTube] Thumbnail upload warning: {e}")

        return {
            "success": True,
            "video_id": video_id,
            "url": video_url,
            "response": response
        }

if __name__ == "__main__":
    uploader = YouTubeUploader()
    print("YouTubeUploader module initialized.")
