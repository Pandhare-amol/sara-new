import asyncio
import os
import re
import sys
from pathlib import Path
from typing import Dict, List, Any

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import edge_tts
from moviepy.editor import AudioFileClip
from config.settings import DEFAULT_VOICE, TEMP_DIR

class TTSEngine:
    def __init__(self, voice: str = DEFAULT_VOICE):
        self.voice = voice

    async def _synthesize_async(self, text: str, output_path: str, rate: str = "+0%", pitch: str = "+0Hz") -> List[Dict[str, Any]]:
        communicate = edge_tts.Communicate(text, self.voice, rate=rate, pitch=pitch)
        subtitles = []

        with open(output_path, "wb") as f:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    f.write(chunk["data"])
                elif chunk["type"] == "SentenceBoundary":
                    # offset and duration are in 100-nanosecond units (10,000,000 units = 1 sec)
                    start_sec = chunk["offset"] / 10_000_000.0
                    duration_sec = chunk["duration"] / 10_000_000.0
                    end_sec = start_sec + duration_sec
                    sentence_text = chunk["text"].strip()
                    
                    # Split into word approximations for dynamic subtitles
                    words = sentence_text.split()
                    if words:
                        word_dur = duration_sec / len(words)
                        word_items = []
                        for i, w in enumerate(words):
                            w_start = start_sec + (i * word_dur)
                            w_end = w_start + word_dur
                            word_items.append({"word": w, "start": w_start, "end": w_end})
                    else:
                        word_items = []

                    subtitles.append({
                        "text": sentence_text,
                        "start": start_sec,
                        "end": end_sec,
                        "words": word_items
                    })

        return subtitles

    def generate_speech(self, text: str, output_path: str = None, rate: str = "+0%", pitch: str = "+0Hz") -> Dict[str, Any]:
        """
        Synthesizes text into high quality voiceover and returns duration + subtitle timings.
        """
        if output_path is None:
            output_path = str(TEMP_DIR / f"tts_{os.getpid()}_{hash(text) % 100000}.mp3")

        # Clean text of markdown artifacts
        clean_text = re.sub(r'[*_#`]', '', text).strip()

        # Run async synthesis with retry
        subtitles = []
        max_retries = 4
        for attempt in range(max_retries):
            try:
                subtitles = asyncio.run(self._synthesize_async(clean_text, output_path, rate=rate, pitch=pitch))
                if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
                    break
            except Exception as e:
                print(f"[TTSEngine] TTS attempt {attempt + 1} retry: {e}")
                import time
                time.sleep(2 * (attempt + 1))

        # Determine exact duration
        duration = 0.0
        try:
            with AudioFileClip(output_path) as audio:
                duration = audio.duration
        except Exception:
            if subtitles:
                duration = subtitles[-1]["end"]

        return {
            "audio_path": output_path,
            "duration": duration,
            "subtitles": subtitles
        }

if __name__ == "__main__":
    tts = TTSEngine()
    result = tts.generate_speech("In the year 2099, artificial intelligence and quantum neural networks merged to redefine reality.")
    print(f"Generated: {result['audio_path']}, Duration: {result['duration']:.2f}s, Subtitles count: {len(result['subtitles'])}")
