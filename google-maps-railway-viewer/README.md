# Railway Viewer

路線名から候補を選び、駅と線路を地図に表示するReact・TypeScriptのWebアプリです。Pythonはデータ生成・検証を担当し、uvの専用環境で動作します。

## 現在使える機能

2026-09-13時点の開発版です。全国のN02基礎データに、山手線・中央線の運行系統を加えた598候補を検索できます。598は収録候補数で、全国の実在路線数ではありません。

- 路線名・駅名・鉄道会社名から、入力中に候補を表示します。会社・都道府県・対象区間で同名路線を区別し、駅名で一致した場合は該当駅を併記します。「新宿」「新宿駅」のどちらでも検索できます。
- 会社の表示名・正式名と、確認済みの略称（京急・名鉄・近鉄・西鉄・大阪メトロ）で検索します。
- 山手線は環状運転の30駅。中央線（快速）は東京〜高尾の24駅、中央・総武線各駅停車は三鷹〜千葉の39駅を対象とします。直通区間を含めない旨を候補に表示します。
- 路線ごとの駅一覧、赤ピン、元データの線形に沿った緑線。駅とピンの選択を連動させます。
- 初期設定は「背景地図なし」の線形プレビューです。キーを保存しただけではGoogle Mapsへ接続しません。
- PCでは左側に一覧、スマートフォン幅では下側に開閉パネルを表示します。

全国の運行系統の照合、列車種別・停車パターン・時刻表の取得は未完了です。種別の複数選択と停車の集約処理は実装し、テスト用データで検証していますが、実在路線には未取得の種別を作りません。所要時間の照会・並べ替えは未実装です。この状態を全国対応の正式リリースとは扱いません。

## macOSで初回の準備

配置先は `/Users/mk/Documents/google-maps-extended/google-maps-railway-viewer` です。

1. Finderでこのフォルダの `setup.command` を開きます。ターミナルから `./setup.command` でも実行できます。
2. 公式Node.js 24.21.0をリポジトリ内の `.tools/` に取得し、固定したSHA-256を照合します。Apple SiliconとIntelの取得先を切り替えます。
3. `npm ci`、`uv sync --locked`、公式鉄道データの取得、画面データの生成を順に実行します。
4. 未作成の場合だけ、設定例から `.env.local` を作ります。既存設定は上書きしません。

uvはこのPCに導入済みです。別のPCでは[uvの公式導入手順](https://docs.astral.sh/uv/getting-started/installation/)で準備してください。システムのPython・Node.jsは置き換えません。Pythonは3.12.13に固定し、`.venv/`に分離します。初回取得にはインターネット接続が必要です。

## 普段の起動と終了

Finderから `start.command` を開くと、既定ブラウザで `http://127.0.0.1:5173` を開きます。ターミナルの場合は次の手順です。

```sh
cd /Users/mk/Documents/google-maps-extended/google-maps-railway-viewer
source scripts/env.sh
npm run dev
```

`source scripts/env.sh` は、そのターミナルだけにアプリ専用Node.jsのPATHを設定します。Node.js 24.21.0がすでにPATHにある場合は省略できます。

終了は起動元のターミナルで **Ctrl+C**。ブラウザを閉じるだけではサーバーは止まりません。5173番ポートが使用中なら別のポートには移動せずエラーを表示します。ブラウザを自動で開かずに起動する場合は `npm run dev -- --no-open` を使います。

現段階の表示データは静的ファイルなので、FastAPIは起動しません。秘密キーが必要な時刻表取得元を採用する際は、設計どおりローカルAPI側へ追加します。

## Google マップを表示する

一般的には本番利用に標準APIキーと課金設定を使いますが、試作にはGoogleが提供する **Maps Demo Key** も利用できます。2026-09-13に確認した公式案内では、課金情報を入力せず、地図・マーカー・ポリラインを試せます。試作限定で、利用上限があります。[Maps Demo Keyの案内](https://developers.google.com/maps/documentation/javascript/demo-key)

1. 無料で試す場合は[Maps Demo Keyの案内](https://developers.google.com/maps/documentation/javascript/demo-key)の **Get a Demo Key** から取得します。通常のAPIキー作成やGoogle Cloudの無料トライアル登録とは区別してください。Googleアカウントへのログインと規約への同意は利用者自身で行います。課金アカウントへの更新は不要です。
2. `.env.local` の `VITE_GOOGLE_MAPS_API_KEY=` の右側にキーを保存します。チャットやGitHubには貼り付けません。
3. Google Cloudのキー設定で制限を設定できる場合は、使用APIをMaps JavaScript API、ウェブサイトのHTTPリファラーを `http://127.0.0.1:5173/*` と `http://localhost:5173/*` に制限します。IPアドレス制限ではありません。
4. `VITE_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID` は開発用Map IDです。これはAPIキーの代わりにはなりません。公開時には自身のMap IDへ切り替えます。
5. Demo Keyであることを確認してから `.env.local` の `VITE_GOOGLE_MAPS_MODE=preview` を `VITE_GOOGLE_MAPS_MODE=google` に変更します。設定がない場合・値が異なる場合もプレビューになります。アプリがキーの料金体系を自動判別する機能ではありません。
6. アプリを停止して再起動します。読み込み・認証に失敗した場合は、キーの種類、利用上限、APIの有効化、リファラー制限を確認します。Demo Keyの日次上限に達した場合は翌日まで待ちます。

ブラウザ用キーは利用者から閲覧可能です。`.env.local`だけで秘密になるとは扱わず、Google側の制限を設定します。キー制限は料金の上限設定ではありません。標準キーの無料利用は保証せず、料金体系が不明な間は `preview` を使います。[公式のキー制限](https://developers.google.com/maps/api-security-best-practices)、[公式の料金・利用量の説明](https://developers.google.com/maps/documentation/javascript/usage-and-billing)

## データの更新と出典

駅名検索を追加した版では、索引をschemaVersion 2へ更新しています。以前から利用している場合も、次のコマンドでデータを再生成してください。

```sh
uv run --locked python -m railway_data --download
npm run data:build
```

取得済みZIPを検証して再利用し、新規取得は一時ファイルを検証してから保存します。原典の版が変更された場合はハッシュ検証を無効にせず、版と利用条件を確認してコード・テストを更新します。

- 鉄道: [国土数値情報 N02 2025年版](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2025.html)。2025-12-31基準。
- 都道府県: [国土数値情報 N03 2026年版](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html)。2026-01-01基準。鉄道・駅線形との交差から名称を集計し、境界形状は配布しません。照合できない地物は推定せず一部未確認にします。
- 山手線の所属・順序: [JR東日本の駅一覧](https://media.jreast.co.jp/articles/1214)。中央線の区間・所属: [JR東日本の東京近郊路線図](https://www.jreast.co.jp/map/pdf/map_tokyo.pdf)。運行系統は原典の路線区分と分離します。

国土数値情報（鉄道・行政区域データ）（国土交通省）を加工して作成しています。線路は原典の代表線で、上下線・各ホームの線路を区別しません。ピンは駅線形の代表点で、改札や入口の位置ではありません。JGD2011からWGS84へpyprojで変換し、変換方式は `JGD2011 to WGS 84 (1)` です。

都道府県一覧の再生成が必要な開発者は、公式N03 ZIPを取得し、次を実行します。大きなZIPはGitへ追加しません。

```sh
uv run --locked python -m railway_data.regions --n03 /path/to/N03-20260101_GML.zip
npm run data:build
```

出典・版・SHA-256・照合件数は `data/catalog/route-prefectures.json` に記録しています。`public/data/` は再生成できる配布用データなのでGit対象外です。収録範囲と残る課題は[データ調査](../docs/data-feasibility.md)を参照してください。

## 検証

```sh
npm run check
npm test
npm run build
npm run test:launch
uv run --locked ruff format --check railway_data tests
uv run --locked ruff check railway_data tests
uv run --locked mypy railway_data tests
uv run --locked python -m unittest discover -s tests -v
```

`test:launch` はアプリを起動していない状態で実行します。公式データを使うPythonテストには取得済みN02 ZIPが必要です。テストで使う列車種別は人工的な検証用データで、画面の実在路線には混ぜません。

## 設計資料

- [要件](../docs/requirements.md)
- [起動・表示方針](../docs/launch-and-display.md)
- [路線検索](../docs/route-search.md)
- [列車の種類・停車駅・所要時間](../docs/train-services.md)
- [開発手順](../docs/development-workflow.md)
