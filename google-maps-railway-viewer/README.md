# Railway Viewer

日本全国の鉄道路線を検索し、Google マップに全駅と線路を表示するアプリです。

## 現在の状態

検索・地図の画面は未実装です。起動・表示の基本案は確認済みです。全国データの収録内容を検証するPython処理を追加しました。

Pythonの環境設定はuvで管理します。

## Python環境

```sh
uv sync --locked
uv run --locked python -c 'import sys; print(sys.version); print(sys.executable); print(sys.base_prefix)'
```

`.python-version`でPythonを固定し、`.venv`をプロジェクト専用に生成します。uv管理のPythonのみを選択します。

## 全国データの調査台帳を生成する

アプリディレクトリで以下を実行します。初回の取得にはインターネット接続が必要です。

```sh
mkdir -p data/raw
curl --fail --location --output data/raw/N02-25_GML.zip https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-25/N02-25_GML.zip
uv run --locked python -m railway_data --archive data/raw/N02-25_GML.zip
```

調査済みZIPのSHA-256と照合し、会社・路線別のCSVと集計JSONを`data/catalog/`に出力します。ZIPはGitに含めません。配布元の内容が変更された場合は、検証を省略せず新版の内容と利用条件を確認します。

生成台帳の件数は元データ内の集計で、全国の利用者向け路線や駅の実数ではありません。時刻表や停車駅フィルターは生成しません。収録内容と不足は[データ調査](../docs/data-feasibility.md)を参照してください。

## Pythonの検証

```sh
uv run --locked ruff format --check railway_data tests
uv run --locked ruff check railway_data tests
uv run --locked mypy railway_data tests
uv run --locked python -m unittest discover -s tests -v
```

## 設計資料

- [要件](../docs/requirements.md)
- [起動・表示方針](../docs/launch-and-display.md)
- [路線検索](../docs/route-search.md)
- [列車の種類・停車駅・所要時間](../docs/train-services.md)
- [開発手順](../docs/development-workflow.md)
