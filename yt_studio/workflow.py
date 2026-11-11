import os
import sys
import time
from pathlib import Path
from typing import Dict, Any, Optional

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

from config.settings import SHORTS_OUTPUT, LONGFORM_OUTPUT, TEMP_DIR, DEFAULT_VOICE
from core.script_engine import ScriptEngine
from core.tts_engine import TTSEngine
from core.image_engine import ImageEngine
from core.audio_library import AudioLibrary
from core.video_engine import VideoEngine
from core.youtube_uploader import YouTubeUploader
from core.instagram_uploader import InstagramUploader

class VideoStudioWorkflow:
    def __init__(self):
        self.script_engine = ScriptEngine()
        self.tts_engine = TTSEngine(voice=DEFAULT_VOICE)
        self.image_engine = ImageEngine()
        self.audio_lib = AudioLibrary()
        self.yt_uploader = YouTubeUploader()
        self.ig_uploader = InstagramUploader()

    def run_pipeline(
        self,
        story_key: str = "quantum_singularity",
        format_type: str = "portrait",  # "portrait" (9:16) or "landscape" (16:9)
        custom_topic: Optional[str] = None,
        auto_upload_youtube: bool = True,
        auto_upload_instagram: bool = True,
        privacy_status: str = "public"
    ) -> Dict[str, Any]:
        """
        Executes the entire end-to-end automated workflow:
        Script -> Voiceover -> AI Images -> Assembly & Ken Burns -> Subtitles -> Background Music -> Social Upload
        """
        start_time = time.time()
        print("\n" + "="*60)
        print(f"🚀 STARTING AUTONOMOUS VIDEO STUDIO PIPELINE")
        print(f"Format: {format_type.upper()} | Story: {custom_topic or story_key}")
        print("="*60 + "\n")

        # 1. SCRIPT GENERATION
        print("📝 Step 1: Generating Story Script & Visual Storyboards...")
        if custom_topic:
            scene_count = 4 if format_type == "portrait" else 10
            story_data = self.script_engine.generate_custom_story(custom_topic, format_type, scene_count)
        else:
            story_data = self.script_engine.get_template_story(story_key, format_type)

        title = story_data["title"]
        description = story_data["description"]
        tags = story_data["tags"]
        scenes_def = story_data["scenes"]
        print(f"   Title: '{title}' ({len(scenes_def)} scenes)")

        # 2. AUDIO & VISUAL ASSETS GENERATION
        processed_scenes = []
        aspect_ratio = "9:16" if format_type == "portrait" else "16:9"

        for i, sc in enumerate(scenes_def):
            scene_num = i + 1
            narration = sc["narration"]
            visual_prompt = sc["visual_prompt"]
            print(f"\n🎬 Processing Scene {scene_num}/{len(scenes_def)}...")

            # 2a. Voiceover
            print(f"   🎙️ Synthesizing Voiceover (edge-tts)...")
            audio_out = str(TEMP_DIR / f"voice_scene_{scene_num}_{int(time.time())}.mp3")
            tts_res = self.tts_engine.generate_speech(narration, audio_out)
            duration = tts_res["duration"]
            subtitles = tts_res["subtitles"]
            print(f"      Duration: {duration:.2f}s | Subtitle cues: {len(subtitles)}")

            # 2b. Visuals (AI Image)
            print(f"   🎨 Generating Futuristic Scene Art ({aspect_ratio})...")
            img_out = str(TEMP_DIR / f"art_scene_{scene_num}_{int(time.time())}.jpg")
            img_path = self.image_engine.generate_image(visual_prompt, img_out, aspect_ratio=aspect_ratio, seed=100+scene_num)
            print(f"      Art saved: {Path(img_path).name}")

            processed_scenes.append({
                "scene_id": scene_num,
                "image_path": img_path,
                "audio_path": audio_out,
                "duration": duration,
                "subtitles": subtitles
            })

        # 3. VIDEO ASSEMBLY & ANIMATION
        print("\n🎞️ Step 3: Assembling Video with Ken Burns Animation, Subtitles & Audio...")
        clean_title = "".join(c for c in title if c.isalnum() or c in (" ", "_", "-")).replace(" ", "_")
        timestamp_str = int(time.time())

        if format_type == "portrait":
            output_mp4 = str(SHORTS_OUTPUT / f"short_{clean_title}_{timestamp_str}.mp4")
            video_engine = VideoEngine(preset="portrait")
        else:
            output_mp4 = str(LONGFORM_OUTPUT / f"longform_{clean_title}_{timestamp_str}.mp4")
            video_engine = VideoEngine(preset="landscape")

        bg_music = self.audio_lib.get_background_music()
        video_engine.assemble_video(
            scenes=processed_scenes,
            output_file=output_mp4,
            background_music_path=bg_music,
            add_subtitles=True
        )

        total_elapsed = time.time() - start_time
        print(f"\n✅ Video successfully produced in {total_elapsed:.1f}s!")
        print(f"📁 Output Video: {output_mp4}")

        # 4. AUTONOMOUS SOCIAL MEDIA PUBLISHING
        upload_results = {}
        
        # YouTube Upload
        if auto_upload_youtube:
            print("\n📡 Step 4: Autonomous YouTube Publishing...")
            yt_res = self.yt_uploader.upload_video(
                video_path=output_mp4,
                title=f"{title} #Shorts" if format_type == "portrait" else title,
                description=f"{description}\n\n#SciFi #AI #Storytelling #Future #Technology",
                tags=tags,
                privacy_status=privacy_status
            )
            upload_results["youtube"] = yt_res

        # Instagram Upload (Reels for portrait)
        if auto_upload_instagram and format_type == "portrait":
            print("\n📸 Step 5: Autonomous Instagram Reel Publishing...")
            ig_caption = f"{title}\n\n{description}\n\n#reels #scifi #future #ai #storytelling #cyberpunk"
            ig_res = self.ig_uploader.upload_reel(
                video_path=output_mp4,
                caption=ig_caption
            )
            upload_results["instagram"] = ig_res

        print("\n" + "="*60)
        print("🎉 WORKFLOW COMPLETED SUCCESSFULLY!")
        print(f"Video File: {output_mp4}")
        print("="*60 + "\n")

        return {
            "title": title,
            "format": format_type,
            "output_video": output_mp4,
            "duration": sum(sc["duration"] for sc in processed_scenes),
            "upload_results": upload_results,
            "elapsed_time_sec": total_elapsed
        }

if __name__ == "__main__":
    workflow = VideoStudioWorkflow()
    # Test run generating a portrait short
    result = workflow.run_pipeline(
        story_key="quantum_singularity",
        format_type="portrait",
        auto_upload_youtube=False,
        auto_upload_instagram=False
    )
    print("Test run completed:", result["output_video"])
