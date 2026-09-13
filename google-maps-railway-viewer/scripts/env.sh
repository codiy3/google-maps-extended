# ターミナルで source scripts/env.sh を実行して専用Node.jsを選択する。
# アプリディレクトリで読み込む。bashとzshの両方で使うため、呼び出し元PWDを使う。
if [ ! -f .node-version ] || [ ! -f scripts/dev.mjs ]; then
  echo 'google-maps-railway-viewerディレクトリで source scripts/env.sh を実行してください。'
  return 1
fi
railway_env_root="$(cd .. && pwd)"
railway_env_arch="$(uname -m)"
if [ "$railway_env_arch" = "x86_64" ]; then railway_env_arch=x64; fi
export PATH="$railway_env_root/.tools/node-v24.21.0-darwin-$railway_env_arch/bin:$PATH"
unset railway_env_root railway_env_arch
