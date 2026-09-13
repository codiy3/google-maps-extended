# Google Maps Extended

Google マップを利用した機能拡張を管理するリポジトリです。

最初のアプリは、日本全国の鉄道路線を検索し、全駅の赤ピンと線路に沿う緑色のハイライトを表示する Railway Viewer です。同名路線の入力候補、列車の種類ごとの停車駅フィルター、種別順と日時指定の所要時間順を要件に含めています。

## 状態

2026年9月14日現在、路線検索と乗換案内の2モードを実装しています。路線・駅・鉄道会社の検索、複数路線の色分け、駅名・駅詳細、経由駅付きの概算距離経路をGoogle Mapsまたは線形プレビューで表示します。macOSの初回準備と起動は[アプリのREADME](google-maps-railway-viewer/README.md)を参照してください。

全国の運行系統の照合と列車種別・時刻表の取得は未完了です。所要時間・最早到着の計算処理と表示欄は実装していますが、実時刻表がない区間は未取得・未計算と表示します。正式リリース前の開発版です。Google Mapsの実表示には利用者のDemo Key設定と接続の有効化が必要です。初期設定では外部地図へ接続しません。

## 構成

- `google-maps-railway-viewer/`: アプリとデータ処理
- `docs/requirements.md`: 要件と未確定事項
- `docs/launch-and-display.md`: 起動・表示方針の提案
- `docs/route-search.md`: 同名路線・運行系統名の入力候補と選択
- `docs/train-services.md`: 列車の種類・停車駅・所要時間とデータ取得の条件
- `docs/development-workflow.md`: コミットと検証の運用
- [全国データの調査](docs/data-feasibility.md): 取得済みデータ、実データの補完事項、種別・時刻表の不足
- [設計の自己レビュー記録](docs/reviews/2026-09-13-requirements.md): 指摘・修正コミット・再確認の結果
- [複数路線・接続先・データ保存](docs/connections-and-storage.md)
- [乗換案内](docs/journey-mode.md): 共通機能、経由駅、距離・時間の計算条件と制約

GitHubの作成先は `codiy3/google-maps-extended`、公開範囲はユーザー指定によりPrivateです。
