#!/usr/bin/env bash
# Берёт preview.mp3 и обновляет assets/meow.mp3 (первое «мяу», ~1 с).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$HOME/Downloads/preview.mp3}"
DEST="$ROOT/assets/meow.mp3"

if [[ ! -f "$SRC" ]]; then
  echo "Файл не найден: $SRC" >&2
  exit 1
fi

ffmpeg -y -hide_banner -i "$SRC" -ss 0.02 -t 1.0 \
  -af "afade=t=in:st=0:d=0.02,afade=t=out:st=0.82:d=0.15,highpass=f=80,lowpass=f=12000" \
  -ac 1 -ar 44100 -b:a 128k "$DEST"
echo "Wrote $DEST"
