import os
import sys
import time
import urllib.parse
from pathlib import Path
from typing import Optional
import requests
from PIL import Image

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from config.settings import POLLINATIONS_BASE_URL, TEMP_DIR

class ImageEngine:
    def __init__(self, default_style: str = "cinematic futuristic sci-fi, 8k, highly detailed, photorealistic, dramatic volumetric lighting, unreal engine 5"):
        self.default_style = default_style

    def generate_image(
        self,
        prompt: str,
        output_path: Optional[str] = None,
        aspect_ratio: str = "16:9",
        seed: Optional[int] = None
    ) -> str:
        """
        Generates a high quality AI image matching the requested aspect ratio (16:9 or 9:16)
        and saves it to output_path.
        """
        if output_path is None:
            output_path = str(TEMP_DIR / f"img_{int(time.time()*1000)}_{hash(prompt) % 100000}.jpg")

        # Dimensions based on aspect ratio
        if aspect_ratio == "9:16":
            req_w, req_h = 1080, 1920
            # Pollinations generates standard bounds nicely at 768x1344 or 720x1280 then we upscale cleanly
            gen_w, gen_h = 720, 1280
        else:
            req_w, req_h = 1920, 1080
            gen_w, gen_h = 1280, 720

        # Enhance prompt with safe length
        clean_p = prompt.replace("\n", " ").strip()[:140]
        enhanced_prompt = f"{clean_p}, {self.default_style}"
        encoded_prompt = urllib.parse.quote(enhanced_prompt)

        if seed is None:
            seed = int(time.time()) % 1000000

        # Pollinations Free Endpoint
        url = f"{POLLINATIONS_BASE_URL}/{encoded_prompt}?width={gen_w}&height={gen_h}&seed={seed}&nologo=true"

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

        # Try up to 3 times
        max_retries = 3
        success = False
        temp_raw_path = output_path + ".raw.jpg"

        for attempt in range(max_retries):
            try:
                resp = requests.get(url, headers=headers, timeout=45)
                if resp.status_code == 200 and len(resp.content) > 5000:
                    with open(temp_raw_path, "wb") as f:
                        f.write(resp.content)
                    success = True
                    break
                else:
                    time.sleep(2)
            except Exception as e:
                print(f"[ImageEngine] Attempt {attempt+1} failed: {e}")
                time.sleep(2)

        # Post-process with PIL to enforce exact dimensions and RGB mode
        if success and os.path.exists(temp_raw_path):
            try:
                with Image.open(temp_raw_path) as img:
                    img = img.convert("RGB")
                    # Resize to exact requested video resolution
                    if img.size != (req_w, req_h):
                        img = img.resize((req_w, req_h), Image.Resampling.LANCZOS)
                    img.save(output_path, "JPEG", quality=95)
                os.remove(temp_raw_path)
                return output_path
            except Exception as e:
                print(f"[ImageEngine] Error processing image: {e}")
                if os.path.exists(temp_raw_path):
                    os.rename(temp_raw_path, output_path)
                    return output_path

        # If download failed, create a futuristic fallback gradient background
        print("[ImageEngine] Warning: Using fallback synthetic background")
        fallback_img = Image.new("RGB", (req_w, req_h), color=(15, 23, 42))
        fallback_img.save(output_path, "JPEG", quality=90)
        return output_path

if __name__ == "__main__":
    engine = ImageEngine()
    path_16_9 = engine.generate_image("A futuristic cyberpunk metropolis at night with flying vehicles", aspect_ratio="16:9")
    print(f"Generated 16:9: {path_16_9}")
    path_9_16 = engine.generate_image("A futuristic cyborg warrior with glowing cyan cybernetics", aspect_ratio="9:16")
    print(f"Generated 9:16: {path_9_16}")
