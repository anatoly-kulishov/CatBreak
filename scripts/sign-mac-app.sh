#!/bin/bash
# Не используем codesign --deep: ломает подписи Electron Framework (краш при запуске).
# Для пересылки достаточно xattr -cr на принимающем Mac (см. packaging/КАК_ОТКРЫТЬ_НА_ДРУГОМ_MAC.txt).
set -euo pipefail
APP_PATH="${1:-$(find dist -maxdepth 3 -name 'Cat Break.app' -print -quit 2>/dev/null || true)}"
if [[ -n "$APP_PATH" && -d "$APP_PATH" ]]; then
  xattr -cr "$APP_PATH" 2>/dev/null || true
  echo "Cleared xattr on: $APP_PATH"
fi
