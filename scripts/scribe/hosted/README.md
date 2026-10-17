# Hosted speech runtime

Status: prepared and tested locally; deployment is on hold at the owner's request because of
the additional hosting cost. No server has been purchased and production speech remains disabled.

This optional service runs Whisper and Ollama on a server controlled by Mohuddle. The existing
Render backend keeps authentication, permissions, records and note validation. Only authenticated
server-to-server requests reach this runtime. Recordings and transcripts stay in memory; only a
staff-reviewed, signed note is stored by the app. Ollama and the Python port are not published to
the internet; Caddy supplies HTTPS and forwards to the authenticated gateway.

Use a dedicated Linux server with at least 8 GB RAM, preferably 4 CPU cores. The current Render
512 MB instance cannot run the chosen 4B note model. Do not put this workload on the database host.
CPU drafting can be slower than a GPU; benchmark a synthetic note before enabling staff access.

## Deploy after the hosting cost is approved

Copy the `scripts/scribe` directory to a private deployment directory on the dedicated server.
Install Docker and Compose from their official repositories. Open only SSH and HTTP/HTTPS in the
host firewall. Point `voice.mohuddle.com` to this server. In `hosted/`, create a private `.env`
from `.env.example`, use a random key of at least 32 characters, and restrict the file to its owner.
Do not commit that file or print its key. The server has no database or email credentials.

```sh
docker compose up -d --build
docker compose exec -T ollama ollama pull qwen3.5:4b
```

Whisper's pinned public model downloads on the first gateway start and stays on its model volume.
Later restarts reuse the completed download offline. Ollama's model also stays on its own volume.
Access logs are disabled; do not add audio, transcript, vocabulary or authorization logging.

Set these **Render secrets**, only after the HTTPS runtime is healthy:

```text
SCRIBE_SERVICE_URL=https://voice.mohuddle.com
SCRIBE_SERVICE_KEY=<the same private gateway key>
```

Do not set them in Vercel or the phone app. Local development still supports `SCRIBE_PYTHON`,
`SCRIBE_WHISPER_ROOT` and `OLLAMA_URL` when the service URL/key are absent. A configured remote
runtime fails closed on failure and never falls back to a third-party transcription provider.

The authenticated `/health?speech=small&model=qwen3.5%3A4b` response must show both `speech` and
`drafting` as true. Test a synthetic recording, a synthetic note draft, and the actual browser
microphone flow before calling speech ready. Do not use real care audio for deployment tests.
Keep `/api/tags`, `/api/chat` and port 11434 private. The public gateway does not permit model-pull,
model-delete or arbitrary Ollama endpoints. Rotate the gateway key on both servers together.

## Checks

```sh
python -m unittest discover -s scripts/scribe/hosted -p test_service.py
```

These checks cover required authentication, audio limits, path traversal rejection, a restricted
model API, nonstreaming replies and sanitized failures. The web transport has separate tests in
`tests/scribe-service.test.ts` that cover HTTPS, credentials and redirect handling.
