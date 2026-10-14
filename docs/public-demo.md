# 課題用公開デモ

更新日: 2026-10-14。ユーザー指定によりリポジトリを公開し、OpenStreetMapでブラウザから試せる版を設ける。ローカルのGoogle Maps接続は維持し、Demo Keyの設定をREADMEで案内する。

- 開発コード: https://github.com/codiy3/google-maps-extended
- デモ: https://codiy3.github.io/google-maps-extended/

## 機能と範囲

路線・駅・会社検索、複数路線の色分け、駅名・駅詳細・接続先、経由駅を含む最短距離候補を公開する。既存の種別フィルターは維持するが、実在する種別・時刻表は未収録のため、時間情報を推定しない。全国の運行系統照合が完了した正式版とは扱わない。

距離は国土数値情報の線路形状上の概算で、営業キロ・徒歩距離・実際の列車接続を表さない。日時を指定しても、距離探索は運転日を保証しない。将来の時刻表取り込み口とODPTの任意接続口はローカル版に残す。

## 公開構成

1. Pythonで検証済みN02から画面JSONを生成する。
2. 一時SQLiteで駅グループ・線路ネットワークを作り、JSONへ書き出す。
3. Reactを`npm run build:public`でビルドする。公開モードは静的データ・OSMへ固定し、`.env.local`にキーがあってもGoogleキーを埋め込まない。
4. GitHub Pagesから静的ファイルを配信する。閲覧時の経路探索はWeb Workerで行い、検索条件をAPIへ送信しない。
5. GitHub Actionsで検査が成功したmainだけをデプロイする。PRでは検査のみ実施する。

公開対象は`dist/`だけ。`.env.local`、SQLite、原典ZIP、ユーザーのレポート、開発者のローカル設定は配信しない。生成データはGit管理外で、CIが同じ固定版の原典から再生成する。カタログ・駅・ネットワークの版が不一致なら検索を拒否する。

OpenStreetMapタイルにはブラウザ標準のキャッシュ・Refererを利用し、画面外の大量取得は行わない。地図表示には外部通信が必要で、OSM提供元の可用性を保証するものではない。出典表示を隠さない。連絡先はリポジトリのIssuesとする。[第三者の権利と出典](../DATA_ATTRIBUTION.md)

## 再現と公開

```sh
cd google-maps-railway-viewer
npm ci
uv sync --locked
uv run --locked python -m railway_data --download
npm run data:build
npm run data:public
npm run build:public
node scripts/verify-public.mjs
```

Nodeは`.node-version`、Pythonは`.python-version`、依存関係は各lockファイルに従う。ローカルの`npm run dev`は従来どおりPython APIを起動する。公開ビルドを確認するときは`npm run preview:public`を使い、`http://127.0.0.1:5175/google-maps-extended/`を開く。

GitHub Settings → Pages → SourceをGitHub Actionsに設定する。公開成功をActionsと未認証アクセスで確認してからレポートにリンクを掲載する。

## レポートでの説明

Google Maps APIの接続方法はローカル版について説明する。公開版はOSMに変更した旨を併記する。MCPサーバーはこの開発では実装していない。「全国対応完成」「実時刻表による乗換案内完成」とは記述しない。
