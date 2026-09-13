#!/bin/bash
set -eu
cd -- "$(dirname -- "$0")"
if [ "$(uname -s)" != "Darwin" ]; then echo 'このセットアップはmacOS用です。READMEの手順を参照してください。'; exit 1; fi
railway_arch="$(uname -m)"
case "$railway_arch" in
  arm64) railway_sha=bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057 ;;
  x86_64) railway_arch=x64; railway_sha=1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097 ;;
  *) echo "未対応のCPUです: $railway_arch"; exit 1 ;;
esac
railway_name="node-v24.21.0-darwin-$railway_arch"
mkdir -p ../.tools
if [ ! -d "../.tools/$railway_name" ]; then
  railway_temp="$(mktemp -d ../.tools/node-download.XXXXXX)"
  trap 'rm -rf -- "$railway_temp"' EXIT
  echo '公式Node.jsをアプリ専用ディレクトリへ取得します。'
  curl --fail --location --silent --show-error --max-time 180 "https://nodejs.org/dist/v24.21.0/$railway_name.tar.gz" -o "$railway_temp/node.tar.gz"
  railway_actual="$(shasum -a 256 "$railway_temp/node.tar.gz" | cut -d ' ' -f 1)"
  if [ "$railway_actual" != "$railway_sha" ]; then echo 'Node.jsの検証に失敗したため中止します。'; exit 1; fi
  tar -xzf "$railway_temp/node.tar.gz" -C "$railway_temp"
  mv "$railway_temp/$railway_name" "../.tools/$railway_name"
fi
export PATH="$(cd "../.tools/$railway_name/bin" && pwd):$HOME/.local/bin:$PATH"
if [ "$(node --version)" != 'v24.21.0' ]; then echo '専用Node.jsの版を確認してください。'; exit 1; fi
if ! command -v uv >/dev/null 2>&1; then echo 'uvが見つかりません。READMEのuv導入手順を確認してください。'; exit 1; fi
npm ci --cache ../.tools/npm-cache
uv sync --locked
uv run --locked python -m railway_data --download
uv run --locked python -m railway_data.export --archive data/raw/N02-25_GML.zip
if [ ! -f .env.local ]; then cp .env.example .env.local; fi
echo '準備ができました。start.commandを開くと起動します。Google マップのキーは.env.localに設定してください。'
