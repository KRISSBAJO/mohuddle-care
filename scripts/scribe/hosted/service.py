"""Authenticated self-hosted gateway. Recordings and transcripts stay in memory only."""
import base64
import hmac
import json
import os
from pathlib import Path
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen

MODEL_ROOT = Path(os.environ.get("SCRIBE_WHISPER_ROOT", "/models/whisper"))
OLLAMA = os.environ.get("OLLAMA_URL", "http://ollama:11434").rstrip("/")
KEY = os.environ.get("SCRIBE_SERVICE_KEY", "")
MAX_PCM = 16000 * 2 * 60 * 10
MAX_ENCODED = 25 * 1024 * 1024
INFERENCE = threading.Lock()
SLOTS = threading.BoundedSemaphore(4)
MODELS = {}


def model_dir(name):
    if name not in ("small", "medium", "turbo"):
        raise ValueError("Unknown speech model")
    return MODEL_ROOT / ("faster-whisper-" + name)


def speech_model(name):
    # Reuse the same offline decoder and dependencies as the original local worker.
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import whisper_worker as engine
    if name not in MODELS:
        MODELS.clear()
        MODELS[name] = engine.WhisperModel(str(model_dir(name)), device="cpu", compute_type="int8", cpu_threads=int(os.environ.get("SPEECH_THREADS", "2")), local_files_only=True)
    return MODELS[name], engine


def upstream(path, data=None):
    request = Request(OLLAMA + path, data=data, headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=240 if data is not None else 3) as response:
        raw = response.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise ValueError("Model response too large")
        return json.loads(raw)


class Handler(BaseHTTPRequestHandler):
    server_version = "MohuddleSpeech"

    def log_message(self, *_args):
        pass  # Never log audio, transcript, vocabulary, credentials or request URLs.

    def reply(self, status, data):
        raw = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(raw)

    def authenticated(self):
        if not KEY or not hmac.compare_digest(self.headers.get("Authorization", "").encode(), ("Bearer " + KEY).encode()):
            self.reply(401, {"error": "Authentication required"})
            return False
        return True

    def do_GET(self):
        if not self.authenticated():
            return
        url = urlsplit(self.path)
        if url.path in ("/ollama/api/tags", "/ollama/api/ps"):
            try:
                self.reply(200, upstream(url.path.removeprefix("/ollama")))
            except Exception:
                self.reply(503, {"error": "Note model unavailable"})
            return
        if url.path != "/health":
            self.reply(404, {"error": "Not found"})
            return
        params = parse_qs(url.query)
        try:
            speech = model_dir(params.get("speech", ["small"])[0])
        except ValueError:
            self.reply(400, {"error": "Unknown speech model"})
            return
        drafting = False
        try:
            model = params.get("model", ["qwen3.5:4b"])[0]
            drafting = any(item.get("name") == model for item in upstream("/api/tags").get("models", []))
        except Exception:
            pass
        self.reply(200, {"speech": (speech / "model.bin").is_file() and (speech / "tokenizer.json").is_file(), "drafting": drafting})

    def do_POST(self):
        if not self.authenticated():
            return
        if not SLOTS.acquire(blocking=False):
            self.reply(429, {"error": "Speech service busy"})
            return
        try:
            self.process_post()
        except (ValueError, UnicodeError, json.JSONDecodeError):
            self.reply(400, {"error": "Invalid speech request"})
        except Exception:
            self.reply(503, {"error": "Speech service unavailable"})
        finally:
            SLOTS.release()

    def process_post(self):
        url = urlsplit(self.path)
        allowed = ("/transcribe", "/warm", "/ollama/api/chat", "/ollama/api/generate")
        if url.path not in allowed:
            self.reply(404, {"error": "Not found"})
            return
        if self.headers.get("Transfer-Encoding"):
            raise ValueError("Content length required")
        size = int(self.headers.get("Content-Length", "0"))
        encoded = self.headers.get("X-Speech-Encoded") == "true"
        maximum = (MAX_ENCODED if encoded else MAX_PCM) if url.path == "/transcribe" else 128 * 1024
        if size < 0 or size > maximum:
            self.reply(413, {"error": "Request too large"})
            return
        self.connection.settimeout(30)
        body = self.rfile.read(size)
        if len(body) != size:
            raise ValueError("Incomplete recording")
        if url.path.startswith("/ollama/"):
            payload = json.loads(body)
            if not isinstance(payload, dict):
                raise ValueError("Invalid model request")
            payload["stream"] = False
            with INFERENCE:
                self.reply(200, upstream(url.path.removeprefix("/ollama"), json.dumps(payload).encode()))
            return
        name = parse_qs(url.query).get("speech", ["small"])[0]
        model_dir(name)  # Validate before importing or loading any model.
        if url.path == "/warm":
            with INFERENCE:
                speech_model(name)
            self.reply(200, {"ok": True})
            return
        if not size or (not encoded and size % 2):
            raise ValueError("Empty or invalid audio")
        vocabulary_header = self.headers.get("X-Speech-Vocabulary", "W10=")
        if len(vocabulary_header) > 16_384:
            raise ValueError("Vocabulary too large")
        vocabulary = json.loads(base64.b64decode(vocabulary_header, validate=True))
        if not isinstance(vocabulary, list) or len(vocabulary) > 120 or any(not isinstance(word, str) or len(word) > 200 for word in vocabulary):
            raise ValueError("Invalid vocabulary")
        with INFERENCE:
            model, engine = speech_model(name)
            import io
            samples = engine.decode_audio(io.BytesIO(body), sampling_rate=16000) if encoded else engine.np.frombuffer(body, dtype="<i2").astype(engine.np.float32) / 32768
            if len(samples) > 16000 * 60 * 10:
                raise ValueError("Recording longer than ten minutes")
            started = time.perf_counter()
            segments, _ = model.transcribe(samples, language="en", beam_size=5, vad_filter=True, condition_on_previous_text=False, hotwords=", ".join(vocabulary)[:800] or None)
            text = " ".join(segment.text.strip() for segment in segments if segment.text.strip())
            self.reply(200, {"text": text, "seconds": round(len(samples) / 16000, 1), "decodeMs": round((time.perf_counter() - started) * 1000)})


if __name__ == "__main__":
    if len(KEY) < 32:
        raise SystemExit("Set SCRIBE_SERVICE_KEY to at least 32 random characters.")
    ThreadingHTTPServer((os.environ.get("BIND_HOST", "127.0.0.1"), int(os.environ.get("PORT", "8000"))), Handler).serve_forever()
