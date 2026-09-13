# 起動・表示方針の提案

状態: ユーザー確認待ち。以下のアプリ起動コマンドは実装後の予定であり、現時点では利用できない。

## 起動

1. 初回にNode.js環境、npm依存関係、uvの仮想環境、Google Maps APIキー、全国鉄道データを準備する。
2. 普段はアプリディレクトリで `npm run dev` を実行する。
3. ローカルサーバーは `127.0.0.1:5173` に固定し、起動後に既定ブラウザを開く。
4. ポートが使用中の場合は、別ポートへの自動変更をせず理由を表示する。
5. ターミナルで `Ctrl+C` を押すとサーバーを停止する。ブラウザを閉じるだけではサーバーは停止しない。
6. ダブルクリック用の `start.command` は、必要に応じて同じ起動処理を呼び出す補助として追加する。

Node.jsの正確なバージョンはフロントエンド構築時に固定する。`package-lock.json`をコミットし、再現時は`npm ci`を使う。

Pythonはデータの初回生成・更新・検証時に利用する。通常の地図閲覧ではPythonサーバーを起動しない。

アプリ本体はローカルで動作するが、Google マップの読み込みにはインターネット接続と利用可能なAPIキーが必要。GitHubへのソース保存とWebサイトの公開は別作業とする。

## Pythonの分離

- uv管理のCPython 3.12.13を使用する。
- `.python-version`で実行バージョンを固定する。
- `pyproject.toml`の`python-preference = "only-managed"`でシステムPythonへのフォールバックを防ぐ。
- アプリ直下の`.venv/`に依存ライブラリを分離する。
- 依存関係を`uv.lock`に記録し、`uv sync --locked`で復元する。
- Python処理は`uv run --locked ...`経由で実行する。
- Gitには設定・コード・ロックファイルを保存し、`.venv`や秘密情報は保存しない。

## 初期画面

- 日本全体の地図と、路線名の検索欄を表示する。
- 検索前は路線を選択していない状態とする。
- 明示操作なしに現在地の取得を要求しない。

## 入力中の候補表示

- 路線名を入力すると、検索欄の直下に候補一覧を表示する。
- 候補の1段目に路線名、2段目に鉄道会社・都道府県、必要に応じて対象区間を表示する。
- 複数の県をまたぐ場合も1県に限定せず、都道府県の一覧を確認できるようにする。
- 候補のクリック・タップ、または上下キーとEnterで路線を確定する。候補の先頭を自動確定しない。
- 別の名前を入力している間も選択済みの路線名と地図は維持し、新しい候補を確定した時点で切り替える。
- 日本語入力の変換確定と路線の選択を区別する。該当なし・読み込み中・取得失敗も区別して表示する。
- 詳細は[路線検索の設計](route-search.md)を参照する。

## 検索結果

- PC: 左側に検索欄と駅一覧、右側に地図を表示する案を推奨する。
- スマートフォン: 地図と検索欄を優先し、駅一覧を下側の開閉パネルに表示する。
- 路線選択時に全体が収まる範囲へ地図を移動する。
- 全駅に赤ピン、線路形状に緑色の線を表示する。
- 全駅のピンは保持し、初期状態ではクラスタリングしない。
- 地図縮小時は近接するピンが重なる可能性がある。駅一覧と拡大操作から各駅を選択できるようにする。
- 駅名ラベルは選択・ポイント時を基本とし、表示密度に応じた常時表示は別途確認する。
- ピンと駅一覧の選択を連動させ、駅名・事業者を表示する。
- 出典・データ基準日・Googleの帰属表示を読める位置に配置する。

## APIキー

ローカル設定は`.env.local`、設定例は`.env.example`に置く。ブラウザ用キーは閲覧可能な性質があるため、`.env`だけで秘匿できるとは扱わず、Google CloudでHTTPリファラーと使用APIを制限する。

標準APIキーの課金設定は未確認。予算通知は利用を自動停止する上限ではないため、料金対策として通知のみを保証しない。

## 参考資料

- [uv: Python versions](https://docs.astral.sh/uv/concepts/python-versions/)
- [uv: Working on projects](https://docs.astral.sh/uv/guides/projects/)
- [uv: Python preference](https://docs.astral.sh/uv/reference/settings/#python-preference)
- [Vite: Server options](https://vite.dev/config/server-options)
- [Google Maps: API key setup](https://developers.google.com/maps/documentation/javascript/get-api-key)
- [Google Maps: API security](https://developers.google.com/maps/api-security-best-practices)
