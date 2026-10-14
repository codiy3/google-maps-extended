# Railway Viewer

路線名から候補を選び、駅と線路を地図に表示するReact・TypeScriptのWebアプリです。Pythonはデータ生成・保存・所要時間計算を担当し、uvの専用環境で動作します。

## 現在使える機能

2026-09-14時点の開発版です。全国のN02基礎データに、山手線・中央線・メトロ3路線の運行系統を加えた598候補を検索できます。598は収録候補数で、全国の実在路線数ではありません。

- 路線名・駅名・鉄道会社名から、入力中に候補を表示します。会社・都道府県・対象区間で同名路線を区別し、駅名で一致した場合は該当駅を併記します。「新宿」「新宿駅」のどちらでも検索できます。
- 会社の表示名・正式名と、確認済みの略称（京急・名鉄・近鉄・西鉄・大阪メトロ）で検索します。
- 山手線は環状運転の30駅。中央線（快速）は東京〜高尾の24駅、中央・総武線各駅停車は三鷹〜千葉の39駅を対象とします。直通区間を含めない旨を候補に表示します。
- 有楽町線24駅（和光市〜新木場）、副都心線16駅（和光市〜渋谷）、千代田線20駅（代々木上原〜北綾瀬）の駅順・区間を公式案内で照合しています。
- 複数路線を追加・解除して表示できます。共有駅のピンをまとめ、駅から乗り換え先・確認済みの直通先へ移動できます。
- 路線ごとの駅一覧、赤ピン、常時表示の駅名、路線ごとの色付き線形。駅とピンの選択を連動し、白い吹き出しにも駅名を表示します。選択駅からの到着時刻は取得済み時刻表がある場合に地図へ表示し、不足時は未取得と表示します。
- 基礎データはローカルのSQLiteに保存し、通常の検索で鉄道の外部APIを呼びません。ODPTの登録は不要です。
- 初期設定は「背景地図なし」の線形プレビューです。キーを保存しただけではGoogle Mapsへ接続しません。
- PCでは左側に一覧、スマートフォン幅では下側に開閉パネルを表示します。
- 路線検索・乗換案内の2モードで、選択路線・駅詳細・種別フィルターを維持します。出発駅・到着駅と任意個数の経由駅から線路上の最短距離候補を表示できます。

全国の運行系統の照合、列車種別・停車パターン・時刻表の取得は未完了です。種別の複数選択と停車の集約処理は実装し、テスト用データで検証していますが、実在路線には未取得の種別を作りません。駅から全駅への所要時間欄と計算処理は実装済みですが、実在路線の時刻表は未取得のため分数を表示できません。種別の所要時間順への並べ替えは未実装です。この状態を全国対応の正式リリースとは扱いません。

## ブラウザだけで試す公開版

[公開デモ](https://codiy3.github.io/google-maps-extended/)はWindows・macOSなどの最近のブラウザから、インストール・ログイン・APIキーなしで利用できます。OpenStreetMapを背景に、路線・駅・会社の検索、複数路線、駅詳細、経由駅を含む線路上の最短距離候補を表示します。

公開版は課題用の試作です。全国の運行系統照合・列車種別・実時刻表は未完了で、時間経路・到着時刻は未計算になります。駅順未照合の候補にはその旨を表示します。

公開版ではPythonサーバーやSQLiteを配信せず、Pythonで生成したJSONを読み、経路探索をWeb Workerで行います。[公開構成の詳細](../docs/public-demo.md)

## macOSで初回の準備

リポジトリを取得し、`google-maps-extended/google-maps-railway-viewer` に移動します。

1. Finderでこのフォルダの `setup.command` を開きます。ターミナルから `./setup.command` でも実行できます。
2. 公式Node.js 24.21.0をリポジトリ内の `.tools/` に取得し、固定したSHA-256を照合します。Apple SiliconとIntelの取得先を切り替えます。
3. `npm ci`、`uv sync --locked`、公式鉄道データの取得、画面データの生成を順に実行します。
4. 未作成の場合だけ、設定例から `.env.local` を作ります。既存設定は上書きしません。

uvはこのPCに導入済みです。別のPCでは[uvの公式導入手順](https://docs.astral.sh/uv/getting-started/installation/)で準備してください。システムのPython・Node.jsは置き換えません。Pythonは3.12.13に固定し、`.venv/`に分離します。初回取得にはインターネット接続が必要です。

## 普段の起動と終了

Finderから `start.command` を開くと、既定ブラウザで `http://127.0.0.1:5173` を開きます。ターミナルの場合は次の手順です。

```sh
cd ~/Documents/google-maps-extended/google-maps-railway-viewer
source scripts/env.sh
npm run dev
```

`source scripts/env.sh` は、そのターミナルだけにアプリ専用Node.jsのPATHを設定します。Node.js 24.21.0がすでにPATHにある場合は省略できます。

終了は起動元のターミナルで **Ctrl+C**。ブラウザを閉じるだけではサーバーは止まりません。5173番ポートが使用中なら別のポートには移動せずエラーを表示します。ブラウザを自動で開かずに起動する場合は `npm run dev -- --no-open` を使います。

同じコマンドから専用Python環境のローカルAPIも起動します。SQLiteは `data/local/railway.sqlite3` に保存し、終了時も残ります。取得済みデータがあれば外部APIの登録・キーなしで検索できます。Googleの背景地図には別途インターネット接続が必要です。

`npm run build` はフロントエンドのビルド検証です。生成したHTMLだけを公開してもローカルAPIは起動しないため、現段階では `npm run dev` / `start.command` で利用してください。

## 乗換案内の使い方

1. 上部の「乗換案内」を選びます。
2. 出発駅と到着駅を入力し、会社・路線・路線の地域を確認して候補を選びます。
3. 必要に応じて「＋ 経由駅を追加」を押します。上下ボタンで順序変更、削除ボタンで取り消せます。指定順に訪れ、滞在時間は含めません。
4. 出発日時と乗換余裕時間を指定し、「経路を検索」を押します。最短距離は線路形状の概算で、徒歩距離・運転日・列車接続を確認した結果ではありません。
5. 結果に含まれる路線を追加し、経路を太線・路線全体を淡い線で表示します。最短時間は実時刻表未取得のため現在は未計算です。同一駅だけを指定した場合は移動なし・0分になります。
6. 「列車種別」「駅一覧」で従来の共通パネルへ移り、駅から乗換先・直通先・所要時間欄を確認できます。「経路・条件」で戻れます。種別を変更すると経路を再検索する必要があります。
7. モード切替時には選択とフィルターを保持します。路線を明示的に地図から外す場合は、その路線の種別条件も解除します。

経路用の接続情報は初回検索時に作り、SQLiteに保存します。次回起動でも同じデータ版なら再利用します。検索した駅・経由駅・日時の履歴は保存しません。鉄道データの外部API、ODPT登録、通常のGoogle APIキーへの切替は不要です。

## Google マップを表示する

この設定は**ローカルでGoogle Mapsを試すための手順**です。公開デモはOpenStreetMapのためキー不要です。Demo Keyは試作用です。コードを取得する方は自身のDemo Keyを用意してください。

一般的には本番利用に標準APIキーと課金設定を使いますが、試作にはGoogleが提供する **Maps Demo Key** も利用できます。2026-09-13に確認した公式案内では、課金情報を入力せず、地図・マーカー・ポリラインを試せます。試作限定で、利用上限があります。[Maps Demo Keyの案内](https://developers.google.com/maps/documentation/javascript/demo-key)

1. 無料で試す場合は[Maps Demo Keyの案内](https://developers.google.com/maps/documentation/javascript/demo-key)の **Get a Demo Key** から取得します。通常のAPIキー作成やGoogle Cloudの無料トライアル登録とは区別してください。Googleアカウントへのログインと規約への同意は利用者自身で行います。課金アカウントへの更新は不要です。
2. `.env.local` の `VITE_GOOGLE_MAPS_API_KEY=` の右側にキーを保存します。チャットやGitHubには貼り付けません。
3. Google Cloudのキー設定で制限を設定できる場合は、使用APIをMaps JavaScript API、ウェブサイトのHTTPリファラーを `http://127.0.0.1:5173/*` と `http://localhost:5173/*` に制限します。IPアドレス制限ではありません。
4. `VITE_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID` は開発用Map IDです。これはAPIキーの代わりにはなりません。公開時には自身のMap IDへ切り替えます。
5. Demo Keyであることを確認してから `.env.local` の `VITE_GOOGLE_MAPS_MODE=preview` を `VITE_GOOGLE_MAPS_MODE=google` に変更します。設定がない場合・値が異なる場合もプレビューになります。アプリがキーの料金体系を自動判別する機能ではありません。
6. アプリを停止して再起動します。読み込み・認証に失敗した場合は、キーの種類、利用上限、APIの有効化、リファラー制限を確認します。Demo Keyの日次上限に達した場合は翌日まで待ちます。

ブラウザ用キーは利用者から閲覧可能です。`.env.local`だけで秘密になるとは扱わず、Google側の制限を設定します。キー制限は料金の上限設定ではありません。標準キーの無料利用は保証せず、料金体系が不明な間は `preview` を使います。[公式のキー制限](https://developers.google.com/maps/api-security-best-practices)、[公式の料金・利用量の説明](https://developers.google.com/maps/documentation/javascript/usage-and-billing)

## データの更新と出典

複数路線・接続情報を追加した版では、索引をschemaVersion 3へ更新しています。以前から利用している場合も、次のコマンドでデータを再生成してください。

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

保存条件、再試行の動作、所要時間の制約、将来のODPT接続口は[複数路線・接続先・データ保存](../docs/connections-and-storage.md)に記載しています。現在の再試行はローカル原典からの復元であり、Googleのデータを恒久保存する機能ではありません。

## 設計資料

- [要件](../docs/requirements.md)
- [起動・表示方針](../docs/launch-and-display.md)
- [路線検索](../docs/route-search.md)
- [列車の種類・停車駅・所要時間](../docs/train-services.md)
- [乗換案内の計算条件](../docs/journey-mode.md)
- [開発手順](../docs/development-workflow.md)
