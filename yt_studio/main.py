import os
import sys
import argparse
from pathlib import Path

# Force UTF-8 encoding on Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from workflow import VideoStudioWorkflow
from config.settings import SHORTS_OUTPUT, LONGFORM_OUTPUT, YOUTUBE_CLIENT_SECRETS_FILE, INSTAGRAM_CREDENTIALS_FILE

def print_banner():
    banner = """
================================================================
          SARA AI AUTONOMOUS VIDEO STUDIO & PUBLISHER           
        100% Free Resources | Dual Format | Auto-Upload         
================================================================
    """
    print(banner)

def main():
    print_banner()
    parser = argparse.ArgumentParser(description="Autonomous Video Creation & Social Media Pipeline")
    parser.add_argument("--format", choices=["portrait", "landscape"], default=None, help="Video format: portrait (9:16) or landscape (16:9)")
    parser.add_argument("--story", default="quantum_singularity", help="Story template key (e.g. quantum_singularity, cybernetic_dystopia)")
    parser.add_argument("--topic", default=None, help="Custom topic to generate a unique story")
    parser.add_argument("--no-upload", action="store_true", help="Skip social media upload (generate video only)")
    parser.add_argument("--privacy", default="public", choices=["public", "unlisted", "private"], help="YouTube video privacy status")

    args = parser.parse_args()
    workflow = VideoStudioWorkflow()

    # If flags passed via CLI
    if args.format:
        format_type = args.format
        topic = args.topic
        story = args.story
        upload = not args.no_upload

        workflow.run_pipeline(
            story_key=story,
            format_type=format_type,
            custom_topic=topic,
            auto_upload_youtube=upload,
            auto_upload_instagram=upload,
            privacy_status=args.privacy
        )
        return

    # Interactive CLI Menu
    while True:
        print("\nSelect an action:")
        print("  1. 📱 Generate Futuristic Short / Reel (9:16 Portrait - Fast Paced & Subtitles)")
        print("  2. 🎬 Generate Full Storytelling Video (16:9 Landscape - Up to 10+ Min Cinematic)")
        print("  3. 💡 Generate Video from Custom Topic (Enter any idea or prompt)")
        print("  4. 🔑 Check / Configure YouTube & Instagram Credentials")
        print("  5. 📂 View Generated Videos")
        print("  6. ❌ Exit")

        choice = input("\nEnter choice (1-6): ").strip()

        if choice == "1":
            workflow.run_pipeline(
                story_key="quantum_singularity",
                format_type="portrait",
                auto_upload_youtube=True,
                auto_upload_instagram=True
            )

        elif choice == "2":
            workflow.run_pipeline(
                story_key="quantum_singularity",
                format_type="landscape",
                auto_upload_youtube=True,
                auto_upload_instagram=False
            )

        elif choice == "3":
            topic = input("Enter your futuristic video topic (e.g. 'Martian Cities in 2100'): ").strip()
            fmt = input("Format? (1 = 9:16 Shorts/Reels, 2 = 16:9 Landscape) [Default 1]: ").strip()
            selected_fmt = "landscape" if fmt == "2" else "portrait"
            if topic:
                workflow.run_pipeline(
                    custom_topic=topic,
                    format_type=selected_fmt,
                    auto_upload_youtube=True,
                    auto_upload_instagram=(selected_fmt == "portrait")
                )

        elif choice == "4":
            print("\n--- Credential Status ---")
            yt_status = "✅ Configured" if YOUTUBE_CLIENT_SECRETS_FILE.exists() else "⚠️ Not configured (Save client_secrets.json in config/)"
            ig_status = "✅ Configured" if INSTAGRAM_CREDENTIALS_FILE.exists() else "⚠️ Not configured (Create instagram_config.json in config/)"
            print(f"YouTube OAuth: {yt_status}")
            print(f"Instagram Login: {ig_status}")

        elif choice == "5":
            print("\n--- Generated Videos ---")
            shorts = list(SHORTS_OUTPUT.glob("*.mp4"))
            longs = list(LONGFORM_OUTPUT.glob("*.mp4"))
            print(f"Shorts ({len(shorts)}):")
            for s in shorts[-5:]:
                print(f"  • {s.name}")
            print(f"Long-form ({len(longs)}):")
            for l in longs[-5:]:
                print(f"  • {l.name}")

        elif choice == "6":
            print("Exiting Video Studio. Goodbye!")
            break
        else:
            print("Invalid choice. Please select 1-6.")

if __name__ == "__main__":
    main()
