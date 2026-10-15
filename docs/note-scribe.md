# Note scribe ("Speak your note")

Staff talk through the shift. The scribe turns the speech into words, then sorts the words into
the note's parts. Staff check every highlighted part and sign the note themselves. The model
never signs and never overwrites what staff typed.

## How it works

1. The browser records the microphone and decodes the recording to 16 kHz mono PCM.
2. `POST /api/scribe/transcribe` sends it to the speech worker (`scripts/scribe/whisper_worker.py`,
   faster-whisper on the CPU). The worker keeps the model loaded, starts when the note page or Ask
   Mohuddle opens, restarts after a crash and stops after 30 minutes unused to free the memory.
   Names of the person, staff, medications and home are passed as hints so they are spelled right.
3. `POST /api/scribe/draft` asks Ollama for the note's fields, held to a JSON schema
   (`src/lib/scribe.ts`), and checks every field before it reaches the form.

Audio is held in memory for one request and never saved. The words are not stored either;
only the signed note is. Nothing is sent to another company. One job runs at a time.

## Setup on this machine

Everything lives in `E:\Mohuddle` (about 4 GB):

| Folder | What |
| --- | --- |
| `runtime\ollama` | Ollama (CPU build) |
| `models\ollama` | `qwen3.5:4b`, the note model |
| `runtime\speech` | Python 3.12 with faster-whisper |
| `models\whisper\faster-whisper-small` | The speech model |

Start Ollama and leave it running:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/scribe/start-ollama.ps1
```

`.env` points the app at these folders (`SCRIBE_PYTHON`, `SCRIBE_WHISPER_ROOT`, `OLLAMA_URL`).
Admins switch the scribe on or off and pick the models under Settings, Daily notes.

## Model choice (14 Oct 2026, Ryzen 9 5900HX, CPU only)

The same spoken shift note through each model on this machine:

| Model | Result |
| --- | --- |
| qwen3.5:4b | Chosen. Clear third-person note, most facts in the right part. About 40 s to write once loaded; about 2 min to load the first time. |
| qwen2.5:7b | Mostly copied the speech word for word ("I gave him space"). Needs more memory, not faster. |
| qwen3.5:2b | Too thin, with mistakes ("Sunday dinner" as an appointment). |

The note page asks Ollama to load the model as soon as it opens, so it is usually ready by the
time staff stop talking. Ollama needs about 4 GB of free memory for the 4B model.

## Production

A hosted Mohuddle needs a server with these two engines, ideally with a GPU (a draft then takes
a few seconds). The browser's built-in speech typing is not used: Chrome sends the audio to Google.
