"""Download public model files once, before starting the offline speech worker."""
import os
from pathlib import Path
from huggingface_hub import snapshot_download

root = Path(os.environ.get("SCRIBE_WHISPER_ROOT", "/models/whisper")) / "faster-whisper-small"
revision = "536b0662742c02347bc0e980a01041f333bce120"
marker = root / (".ready-" + revision)
if not marker.exists() or not all((root / name).is_file() for name in ("model.bin", "config.json", "tokenizer.json")):
    snapshot_download(repo_id="Systran/faster-whisper-small", revision=revision, local_dir=str(root))
    marker.write_text(revision)
