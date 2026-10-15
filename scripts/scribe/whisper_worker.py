"""
Local speech-to-text worker that stays running, so the Whisper model is loaded once instead of for
every request. Runs offline: the model is read from disk and nothing is sent anywhere.

Usage: python whisper_worker.py <model directory>

Protocol, one request at a time:
  in:  a JSON line {"id": 1, "bytes": 96000, "vocabulary": ["Aisha", ...]}, then exactly that many
       bytes of 16 kHz mono 16-bit PCM
  out: a JSON line {"id": 1, "type": "done", "text": "...", "seconds": 3.0, "decodeMs": 1200}
       or {"id": 1, "type": "error", "message": "..."}
On start it prints {"type": "ready"} once the model is loaded.
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
    sys.stdout.write(json.dumps(data) + "\n")
    sys.stdout.flush()


def read_exact(stream, count):
    chunks = []
    left = count
    while left > 0:
        chunk = stream.read(left)
        if not chunk:
            return None
        chunks.append(chunk)
        left -= len(chunk)
    return b"".join(chunks)


def main():
    threads = max(2, (os.cpu_count() or 4) - 2)
    model = WhisperModel(sys.argv[1], device="cpu", compute_type="int8", cpu_threads=threads, local_files_only=True)
    emit({"type": "ready"})
    stdin = sys.stdin.buffer
    while True:
        header = stdin.readline()
        if not header:
            return  # the server closed the pipe: stop
        request_id = None
        try:
            request = json.loads(header)
            request_id = request.get("id")
            size = int(request.get("bytes", 0))
            if size <= 0 or size > MAX_BYTES or size % 2:
                raise ValueError("Invalid PCM size")
            pcm = read_exact(stdin, size)
            if pcm is None:
                return
            samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768
            vocabulary = request.get("vocabulary") or []
            start = time.perf_counter()
            segments, _info = model.transcribe(
                samples,
                language="en",
                beam_size=5,
                vad_filter=True,
                condition_on_previous_text=False,
                hotwords=", ".join(vocabulary)[:800] or None,
            )
            text = " ".join(segment.text.strip() for segment in segments if segment.text.strip())
            emit({"id": request_id, "type": "done", "text": text, "seconds": round(len(samples) / 16000, 1), "decodeMs": round((time.perf_counter() - start) * 1000)})
        except Exception as error:  # one bad request must not stop the worker
            print(f"scribe whisper failed: {type(error).__name__}: {error}", file=sys.stderr, flush=True)
            emit({"id": request_id, "type": "error", "message": "The local speech engine could not process this recording."})


if __name__ == "__main__":
    main()
