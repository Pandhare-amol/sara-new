# ⚡ Sara AI Autonomous Video Studio & Social Media Manager

A 100% free, end-to-end autonomous video creation and publishing studio designed for YouTube (Long-form & Shorts) and Instagram (Reels).

---

## 🌟 Key Features

1. **Dual Format Rendering**:
   - **Portrait (9:16 - 1080x1920)**: Fast-paced YouTube Shorts & Instagram Reels with high-contrast animated subtitles.
   - **Landscape (16:9 - 1920x1080)**: Cinematic storytelling documentaries (up to 10+ minutes).

2. **100% Free Resources (Zero Cost / No Subscriptions)**:
   - **Voiceover**: Microsoft Neural Speech (`edge-tts`) — realistic, studio-quality AI voices in multiple accents with zero API fees or limits.
   - **Visuals & Art**: Free AI Image Generation (FLUX / Pollinations / SDXL) generating custom futuristic sci-fi visuals for every scene.
   - **Cinematics**: Ken Burns dynamic camera motion (smooth slow zoom-in/out and pan).
   - **Background Music**: Built-in atmospheric sci-fi ambient synth generation and royalty-free music mixing.
   - **Subtitles**: Dynamic contrast pill overlays rendered directly via Pillow (no ImageMagick required).

3. **Autonomous Account Management & Auto-Upload**:
   - **YouTube Automation**: YouTube Data API v3 uploader handling titles, descriptions, SEO tags, category selection, and privacy status.
   - **Instagram Automation**: Direct Reels uploader with captions and hashtag management.

---

## 🚀 Quick Start

### 1. Launch Interactive Studio
Double-click `run.bat` or run:
```powershell
cd D:\project\new_jarvis\Sara\Sara-main\yt_studio
.venv\Scripts\activate
python main.py
```

### 2. Generate via CLI Flags
- Generate a 9:16 Short (without uploading):
  ```powershell
  python main.py --format portrait --story quantum_singularity --no-upload
  ```
- Generate a 16:9 Long-form Video from a custom topic:
  ```powershell
  python main.py --format landscape --topic "The Dyson Sphere Project in 2200" --no-upload
  ```
- Generate & Auto-Upload to YouTube & Instagram:
  ```powershell
  python main.py --format portrait --story quantum_singularity --privacy public
  ```

---

## 🔑 Account Configuration for Auto-Uploading

### YouTube Setup (Free 10,000 units/day quota):
1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a project and search for **YouTube Data API v3** -> Click **Enable**.
3. Go to **APIs & Services > Credentials** -> **Create Credentials > OAuth client ID** (Application type: **Desktop app**).
4. Download the JSON file, rename it to `client_secrets.json`, and place it in the `config/` folder:
   `D:\project\new_jarvis\Sara\Sara-main\yt_studio\config\client_secrets.json`
5. On first run, it will open your browser once to authenticate and save `youtube_token.pickle`. Future uploads will be completely automatic!

### Instagram Setup:
Create a file named `instagram_config.json` inside the `config/` folder:
```json
{
  "username": "your_instagram_username",
  "password": "your_instagram_password"
}
```

---

## 📁 Output Folders

- **Shorts / Reels (9:16)**: `output/shorts/`
- **Long-form Videos (16:9)**: `output/longform/`
- **Background Music**: `assets/music/`
- **Temporary Cache**: `temp/`
