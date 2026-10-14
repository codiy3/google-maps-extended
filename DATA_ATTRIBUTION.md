# データ出典・第三者の権利

公開版・ローカル版の鉄道情報は、以下の原典を加工して作成しています。公開は各原典の情報が現在の運行と一致することを保証するものではありません。

| 原典 | 版・基準日 | 利用条件 | 加工 |
| --- | --- | --- | --- |
| [国土数値情報 鉄道データ（国土交通省）](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2025.html) | N02 2025・2025-12-31 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) | 座標変換、駅代表点、路線別JSON、駅グループ、線形ネットワーク |
| [国土数値情報 行政区域データ（国土交通省）](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html) | N03 2026・2026-01-01 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) | 鉄道・駅との交差から都道府県名を集計。境界形状は配布しない |

山手線・中央線系統・東京メトロ3線の駅順などの照合資料は、各路線JSONとアプリ内の出典欄に記載しています。公式資料の画像・路線図PDFやGoogle APIの応答を複製配布するものではありません。実時刻表は未収録です。

背景地図は [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)。OpenStreetMapデータはODbLで提供されます。背景タイルは配布物に含めず、表示中の範囲だけブラウザから取得します。[タイル利用ポリシー](https://operations.osmfoundation.org/policies/tiles/)。大量取得・オフライン取得機能はありません。

画面ライブラリにはReact（MIT）、Leaflet（BSD-2-Clause）などを使用します。各ライブラリの権利は提供元に帰属します。[Leaflet LICENSE](https://github.com/Leaflet/Leaflet/blob/v1.9.4/LICENSE)、[React LICENSE](https://github.com/facebook/react/blob/main/LICENSE)。Google Mapsをローカルで利用する場合はGoogleの規約が適用されます。

このリポジトリの独自コードには包括的な再利用ライセンスをまだ設定していません。データ・第三者ライブラリ・独自コードの条件を混同しないでください。
