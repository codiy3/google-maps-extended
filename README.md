# Google Maps Extended

Google マップを利用した機能拡張を管理するリポジトリです。

最初のアプリは、日本全国の鉄道路線を検索し、全駅の赤ピンと線路に沿う緑色のハイライトを表示する Railway Viewer です。同名路線の入力候補、列車の種類ごとの停車駅フィルター、種別順と日時指定の所要時間順を要件に含めています。

## 状態

2026年9月13日現在、全国の基礎データを使う検索・駅一覧・線形プレビューと、Google Maps連携のコードを実装しました。macOSの初回準備と起動は[アプリのREADME](google-maps-railway-viewer/README.md)を参照してください。

全国の運行系統の照合と列車種別・時刻表の取得は未完了です。所要時間比較は未実装で、正式リリース前の開発版です。Google Mapsの実表示には利用者のAPIキー設定が必要です。

## 構成

- `google-maps-railway-viewer/`: アプリとデータ処理
- `docs/requirements.md`: 要件と未確定事項
- `docs/launch-and-display.md`: 起動・表示方針の提案
- `docs/route-search.md`: 同名路線・運行系統名の入力候補と選択
- `docs/train-services.md`: 列車の種類・停車駅・所要時間とデータ取得の条件
- `docs/development-workflow.md`: コミットと検証の運用
- [全国データの調査](docs/data-feasibility.md): 取得済みデータ、実データの補完事項、種別・時刻表の不足
- [設計の自己レビュー記録](docs/reviews/2026-09-13-requirements.md): 指摘・修正コミット・再確認の結果

GitHubの作成先は `codiy3/google-maps-extended`、公開範囲はユーザー指定によりPrivateです。
