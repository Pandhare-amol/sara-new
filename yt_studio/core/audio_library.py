import os
import sys
import math
import struct
import wave
from pathlib import Path
from typing import Optional

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from config.settings import MUSIC_DIR, TEMP_DIR

class AudioLibrary:
    def __init__(self):
        self.music_dir = MUSIC_DIR
        self._ensure_default_tracks()

    def _ensure_default_tracks(self):
        """
        Creates/ensures default cinematic futuristic ambient background tracks exist.
        """
        synth_track = self.music_dir / "futuristic_ambient.wav"
        if not synth_track.exists():
            self._generate_ambient_synth_track(str(synth_track), duration_sec=60)

    def _generate_ambient_synth_track(self, output_path: str, duration_sec: int = 60):
        """
        Synthesizes a deep cinematic sci-fi ambient drone track (chord: D minor / atmospheric pad)
        using mathematical waveform synthesis (zero external files required, 100% royalty free).
        """
        sample_rate = 44100
        total_samples = sample_rate * duration_sec
        
        # Atmospheric frequencies (D minor chord + sub bass: D2=73.42Hz, A2=110Hz, F3=174.61Hz, D3=146.83Hz)
        freqs = [73.42, 110.0, 146.83, 174.61, 220.0]
        
        with wave.open(output_path, "wb") as wav_file:
            wav_file.setnchannels(2)  # Stereo
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(sample_rate)
            
            frames = bytearray()
            for i in range(total_samples):
                t = i / sample_rate
                
                # Slow modulation (LFO)
                lfo = 0.5 + 0.5 * math.sin(2 * math.pi * 0.1 * t)
                lfo2 = 0.5 + 0.5 * math.cos(2 * math.pi * 0.05 * t)
                
                # Combine chord harmonics
                sample_val = 0.0
                sample_val += 0.35 * math.sin(2 * math.pi * freqs[0] * t)
                sample_val += 0.20 * math.sin(2 * math.pi * freqs[1] * t + 0.3) * lfo
                sample_val += 0.15 * math.sin(2 * math.pi * freqs[2] * t + 0.7) * lfo2
                sample_val += 0.10 * math.sin(2 * math.pi * freqs[3] * t + 1.2)
                sample_val += 0.05 * math.sin(2 * math.pi * freqs[4] * t) * (1 - lfo)
                
                # Gentle envelope at start and end
                fade_in = min(1.0, t / 4.0)
                fade_out = min(1.0, (duration_sec - t) / 4.0)
                volume_env = fade_in * fade_out * 0.35
                
                final_val = int(max(-32767, min(32767, sample_val * volume_env * 32767)))
                
                # Stereo panning effect
                left_ch = int(final_val * (0.8 + 0.2 * math.sin(2 * math.pi * 0.2 * t)))
                right_ch = int(final_val * (0.8 + 0.2 * math.cos(2 * math.pi * 0.2 * t)))
                
                frames.extend(struct.pack("<hh", left_ch, right_ch))
                
            wav_file.writeframes(frames)
        print(f"[AudioLibrary] Generated cinematic synth track: {output_path}")

    def get_background_music(self, style: str = "ambient") -> str:
        """
        Returns the path to a royalty-free background music track.
        """
        custom_tracks = list(self.music_dir.glob("*.mp3")) + list(self.music_dir.glob("*.wav"))
        if custom_tracks:
            return str(custom_tracks[0])
        
        default_path = str(self.music_dir / "futuristic_ambient.wav")
        if not os.path.exists(default_path):
            self._ensure_default_tracks()
        return default_path

if __name__ == "__main__":
    lib = AudioLibrary()
    path = lib.get_background_music()
    print("Music track ready:", path)
