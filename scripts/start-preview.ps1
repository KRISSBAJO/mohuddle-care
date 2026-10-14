$taskProject = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskNext = Join-Path $taskProject 'node_modules/next/dist/bin/next'
& node $taskNext dev $taskProject --turbopack --port 3400 --hostname 127.0.0.1
