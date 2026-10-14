# Starts Mohuddle's own Ollama for the note scribe, with its models in E:\Mohuddle\models\ollama.
# Leave it running while the app runs. Override the folder with $env:MOHUDDLE_AI_ROOT.
$root = if ($env:MOHUDDLE_AI_ROOT) { $env:MOHUDDLE_AI_ROOT } else { 'E:\Mohuddle' }
$env:OLLAMA_MODELS = Join-Path $root 'models\ollama'
$env:OLLAMA_HOST = '127.0.0.1:11434'
$env:OLLAMA_KEEP_ALIVE = '30m'
& (Join-Path $root 'runtime\ollama\ollama.exe') serve
