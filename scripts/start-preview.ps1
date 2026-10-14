$taskProject = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskNext = Join-Path $taskProject 'node_modules/next/dist/bin/next'
# Run from the project folder: relative paths such as STORAGE_DIR and the scribe worker resolve from here.
Set-Location -LiteralPath $taskProject
& node $taskNext dev $taskProject --turbopack --port 3400 --hostname 127.0.0.1
