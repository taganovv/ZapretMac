#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
python3 scripts/render-tray.py
cd "$ROOT/assets"
qlmanage -t -s 512 -o . icon.svg >/dev/null 2>&1
mv -f icon.svg.png icon.png
echo "Icons updated"
