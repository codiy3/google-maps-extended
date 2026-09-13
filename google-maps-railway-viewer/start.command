#!/bin/bash
set -eu
cd -- "$(dirname -- "$0")"
node_dir="../.tools/node-v24.21.0-darwin-$(uname -m)"
if [ "$(uname -m)" = "x86_64" ]; then node_dir="../.tools/node-v24.21.0-darwin-x64"; fi
if [ -x "$node_dir/bin/node" ]; then export PATH="$(cd "$node_dir/bin" && pwd):$PATH"; fi
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1 || [ ! -d node_modules ]; then
  echo '初回の準備が必要です。同じフォルダのsetup.commandを実行してください。'
  read -r -p 'Enterキーで終了します。' _railway_answer
  exit 1
fi
exec npm run dev
