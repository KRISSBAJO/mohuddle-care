"""
Local speech-to-text for the note scribe. Reads 16 kHz mono 16-bit PCM on stdin and prints one
JSON line with the text. Runs offline: the Whisper model is read from disk and nothing is sent anywhere.

Usage: python whisper.py <model directory>
Env:   SCRIBE_VOCABULARY  JSON list of names and words to listen for (people, staff, medications).
"""
import os

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
import json
import sys
import time

import numpy as np
from faster_whisper import WhisperModel

MAX_BYTES = 16000 * 2 * 60 * 10  # ten minutes


def emit(data):
    print(json.dumps(data), flush=True)


try:
    pcm = sys.stdin.buffer.read(MAX_BYTES + 1)
    if not pcm or len(pcm) > MAX_BYTES or len(pcm) % 2:
        raise ValueError("Invalid PCM")
    samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768
    vocabulary = json.loads(os.environ.get("SCRIBE_VOCABULARY", "[]"))
    threads = max(2, (os.cpu_count() or 4) - 2)
    model = WhisperModel(sys.argv[1], device="cpu", compute_type="int8", cpu_threads=threads, local_files_only=True)
    start = time.perf_counter()
    segments, info = model.transcribe(
        samples,
        language="en",
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=False,
        hotwords=", ".join(vocabulary)[:800] or None,
    )
    text = " ".join(segment.text.strip() for segment in segments if segment.text.strip())
    emit({"type": "done", "text": text, "seconds": round(len(samples) / 16000, 1), "decodeMs": round((time.perf_counter() - start) * 1000)})
except Exception as error:
    # The detail goes to stderr for the server log; staff see a plain message.
    print(f"scribe whisper failed: {type(error).__name__}: {error}", file=sys.stderr, flush=True)
    emit({"type": "error", "message": "The local speech engine could not process this recording."})
    sys.exit(1)
