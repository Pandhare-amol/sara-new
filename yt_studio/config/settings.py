import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_DIR = BASE_DIR / "config"
CORE_DIR = BASE_DIR / "core"
ASSETS_DIR = BASE_DIR / "assets"
MUSIC_DIR = ASSETS_DIR / "music"
FONTS_DIR = ASSETS_DIR / "fonts"
OUTPUT_DIR = BASE_DIR / "output"
SHORTS_OUTPUT = OUTPUT_DIR / "shorts"
LONGFORM_OUTPUT = OUTPUT_DIR / "longform"
TEMP_DIR = BASE_DIR / "temp"

for p in [MUSIC_DIR, FONTS_DIR, SHORTS_OUTPUT, LONGFORM_OUTPUT, TEMP_DIR]:
    p.mkdir(parents=True, exist_ok=True)

# Video Specs
VIDEO_PRESETS = {
    "landscape": {
        "width": 1920,
        "height": 1080,
        "fps": 30,
        "aspect_ratio": "16:9",
        "description": "YouTube Long-form (16:9 Landscape)"
    },
    "portrait": {
        "width": 1080,
        "height": 1920,
        "fps": 30,
        "aspect_ratio": "9:16",
        "description": "YouTube Shorts / Instagram Reels (9:16 Portrait)"
    }
}

# Edge-TTS Neural Voices (100% Free, No API Key needed)
VOICES = {
    "deep_storyteller": "en-US-ChristopherNeural",   # Deep, rich, dramatic narrative voice
    "energetic_host": "en-US-GuyNeural",             # High energy, engaging
    "futuristic_ai": "en-US-EricNeural",             # Analytical, modern tech tone
    "cinematic_female": "en-US-JennyNeural",         # Warm, expressive, compelling
    "hindi_male": "hi-IN-MadhurNeural",              # Hindi natural male
    "hindi_female": "hi-IN-SwaraNeural"              # Hindi natural female
}

DEFAULT_VOICE = "en-US-ChristopherNeural"

# Free Image API Configurations
POLLINATIONS_BASE_URL = "https://image.pollinations.ai/prompt"
IMAGE_MODEL = "flux"  # flux, turbo

# YouTube API Credentials path
YOUTUBE_CLIENT_SECRETS_FILE = CONFIG_DIR / "client_secrets.json"
YOUTUBE_TOKEN_FILE = CONFIG_DIR / "youtube_token.pickle"

# Instagram Credentials path
INSTAGRAM_CREDENTIALS_FILE = CONFIG_DIR / "instagram_config.json"
