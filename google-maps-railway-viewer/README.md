# Railway Viewer

日本全国の鉄道路線を検索し、Google マップに全駅と線路を表示するアプリです。

## 現在の状態

アプリ本体は未実装です。起動・表示方針の確認後にReactとTypeScriptの実装へ進みます。

Pythonの環境設定はuvで管理します。

## Python環境

```sh
uv sync --locked
uv run --locked python -c 'import sys; print(sys.version); print(sys.executable); print(sys.base_prefix)'
```

`.python-version`でPythonを固定し、`.venv`をプロジェクト専用に生成します。uv管理のPythonのみを選択します。

## 設計資料

- [要件](../docs/requirements.md)
- [起動・表示方針](../docs/launch-and-display.md)
- [開発手順](../docs/development-workflow.md)
