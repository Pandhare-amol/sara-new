import os
import sys
import math
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Pillow compatibility patch for MoviePy
import PIL.Image
if not hasattr(PIL.Image, "ANTIALIAS"):
    PIL.Image.ANTIALIAS = PIL.Image.Resampling.LANCZOS

from PIL import Image, ImageDraw, ImageFont
from moviepy.editor import (
    ImageClip, AudioFileClip, CompositeVideoClip, CompositeAudioClip,
    concatenate_videoclips, afx
)
from config.settings import VIDEO_PRESETS, FONTS_DIR, TEMP_DIR

class VideoEngine:
    def __init__(self, preset: str = "landscape"):
        self.preset_name = preset
        self.specs = VIDEO_PRESETS.get(preset, VIDEO_PRESETS["landscape"])
        self.width = self.specs["width"]
        self.height = self.specs["height"]
        self.fps = self.specs["fps"]
        self.is_portrait = (preset == "portrait")

    def _render_subtitle_image(self, text: str, highlight_word: Optional[str] = None) -> np.ndarray:
        """
        Renders crisp, styled subtitle text with dark contrast outline and background pill using Pillow.
        """
        font_size = 54 if self.is_portrait else 44
        try:
            # Try to load Windows standard clean bold font
            font = ImageFont.truetype("arialbd.ttf", font_size)
        except Exception:
            try:
                font = ImageFont.truetype("seguiemj.ttf", font_size)
            except Exception:
                font = ImageFont.load_default()

        # Canvas with transparent background
        max_box_width = int(self.width * 0.85)
        
        # Word wrap text into lines
        words = text.split()
        lines = []
        cur_line = []
        for w in words:
            test_line = " ".join(cur_line + [w])
            bbox = font.getbbox(test_line) if hasattr(font, "getbbox") else (0, 0, len(test_line)*20, font_size)
            w_px = bbox[2] - bbox[0]
            if w_px > max_box_width and cur_line:
                lines.append(" ".join(cur_line))
                cur_line = [w]
            else:
                cur_line.append(w)
        if cur_line:
            lines.append(" ".join(cur_line))

        line_height = int(font_size * 1.35)
        total_text_h = line_height * len(lines)
        box_h = total_text_h + 30
        
        # Create image strip for the subtitles
        img = Image.new("RGBA", (self.width, box_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Draw semi-transparent background backing pill
        pad_x = 24
        pad_y = 12
        for i, line in enumerate(lines):
            bbox = font.getbbox(line) if hasattr(font, "getbbox") else (0, 0, len(line)*20, font_size)
            line_w = bbox[2] - bbox[0]
            x_pos = (self.width - line_w) // 2
            y_pos = i * line_height + 15
            
            # Background pill
            pill_rect = [x_pos - pad_x, y_pos - pad_y, x_pos + line_w + pad_x, y_pos + line_height]
            draw.rounded_rectangle(pill_rect, radius=12, fill=(10, 15, 25, 175))
            
            # Text rendering with glowing stroke
            text_color = (255, 230, 0, 255) if self.is_portrait else (255, 255, 255, 255)
            draw.text(
                (x_pos, y_pos),
                line,
                font=font,
                fill=text_color,
                stroke_width=4,
                stroke_fill=(0, 0, 0, 255)
            )

        return np.array(img)

    def _create_ken_burns_clip(self, image_path: str, duration: float, zoom_in: bool = True) -> ImageClip:
        """
        Creates smooth cinematic Ken Burns slow-zoom animation on the scene image.
        """
        base_clip = ImageClip(image_path).set_duration(duration)
        scale_delta = 0.08  # 8% smooth zoom

        if zoom_in:
            zoomed = base_clip.resize(lambda t: 1.0 + (scale_delta * (t / max(duration, 0.1))))
        else:
            zoomed = base_clip.resize(lambda t: (1.0 + scale_delta) - (scale_delta * (t / max(duration, 0.1))))

        # Center-crop so dimensions stay perfectly at target width & height
        cropped = zoomed.crop(
            x_center=zoomed.w / 2,
            y_center=zoomed.h / 2,
            width=self.width,
            height=self.height
        )
        return cropped

    def assemble_video(
        self,
        scenes: List[Dict[str, Any]],
        output_file: str,
        background_music_path: Optional[str] = None,
        add_subtitles: bool = True
    ) -> str:
        """
        Assembles all scene images, speech audio, subtitle overlays, and background music into a master MP4.
        """
        print(f"[VideoEngine] Assembling {len(scenes)} scenes in {self.preset_name.upper()} format ({self.width}x{self.height})...")
        scene_clips = []

        for idx, scene in enumerate(scenes):
            img_path = scene["image_path"]
            audio_path = scene["audio_path"]
            duration = scene["duration"]
            subtitles = scene.get("subtitles", [])

            # Alternate Ken Burns zoom direction
            zoom_in = (idx % 2 == 0)
            visual_clip = self._create_ken_burns_clip(img_path, duration, zoom_in=zoom_in)

            # Load scene audio
            scene_audio = AudioFileClip(audio_path)
            visual_clip = visual_clip.set_audio(scene_audio)

            # Add subtitle overlay clips
            layers = [visual_clip]
            if add_subtitles and subtitles:
                for sub in subtitles:
                    sub_text = sub["text"]
                    sub_start = max(0.0, sub["start"])
                    sub_dur = min(sub["end"] - sub["start"], duration - sub_start)
                    if sub_dur > 0.1:
                        sub_img_arr = self._render_subtitle_image(sub_text)
                        
                        # Position: lower-third for 16:9, middle/lower-middle for 9:16
                        if self.is_portrait:
                            y_offset = int(self.height * 0.68)
                        else:
                            y_offset = int(self.height * 0.78)
                            
                        sub_clip = (
                            ImageClip(sub_img_arr)
                            .set_start(sub_start)
                            .set_duration(sub_dur)
                            .set_position(("center", y_offset))
                        )
                        layers.append(sub_clip)

            composed_scene = CompositeVideoClip(layers, size=(self.width, self.height)).set_duration(duration)
            scene_clips.append(composed_scene)

        # Concatenate all scenes seamlessly
        master_video = concatenate_videoclips(scene_clips, method="compose")
        total_duration = master_video.duration

        # Background music mixing
        if background_music_path and os.path.exists(background_music_path):
            try:
                bg_music = AudioFileClip(background_music_path)
                
                # Loop if video duration exceeds track length
                if bg_music.duration < total_duration:
                    loop_count = math.ceil(total_duration / bg_music.duration)
                    bg_music = afx.audio_loop(bg_music, nloops=loop_count)
                
                # Trim to exact video length and lower volume to 12% so voiceover stays crisp
                bg_music = bg_music.subclip(0, total_duration).volumex(0.12)
                bg_music = bg_music.audio_fadeout(3.0)

                # Composite voiceover + background music
                final_audio = CompositeAudioClip([master_video.audio, bg_music])
                master_video = master_video.set_audio(final_audio)
            except Exception as e:
                print(f"[VideoEngine] Note: Background music mix skipped: {e}")

        # Render video to MP4
        print(f"[VideoEngine] Rendering final video ({total_duration:.1f}s) to {output_file}...")
        master_video.write_videofile(
            output_file,
            fps=self.fps,
            codec="libx264",
            audio_codec="aac",
            threads=4,
            preset="fast",
            logger=None
        )

        # Close clips to free memory
        master_video.close()
        for sc in scene_clips:
            sc.close()

        print(f"[VideoEngine] Finished rendering: {output_file}")
        return output_file

if __name__ == "__main__":
    print("VideoEngine loaded successfully.")
