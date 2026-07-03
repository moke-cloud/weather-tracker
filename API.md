# TenkiTracker 公開API 仕様書

- **バージョン:** v1
- **最終更新:** 2026-07-03
- **提供:** TenkiTracker (https://moke-cloud.github.io/weather-tracker/)

## 1. 概要

日本の47都道府県庁所在地について、以下のデータを静的JSONで配信するAPIです。

| データ | 内容 |
|---|---|
| コンセンサス天気予報 | JMA MSM / ECMWF IFS / ICON / UKMO / GFS / GEM の6モデル加重平均 + AMeDAS実測バイアス補正。48時間の時間別 + 7日間の日別 |
| AMeDAS実測値 | 最寄り観測点の気温・湿度・海面気圧・降水・風 (10分値) |
| 頭痛リスク予測 | 医学論文ベース6因子モデルのスコア (0-100)・5段階レベル・24時間推移 |
| 傘予報 | 「いつからいつまで・どのレベルの傘が必要か」の時間帯レンジ。降水確率はアンサンブル82メンバー (ECMWF ENS 51 + NOAA GEFS 31) 由来 |

- **認証:** 不要 (APIキーなし)
- **料金:** 無料
- **CORS:** 全オリジン許可 (`Access-Control-Allow-Origin: *`) — ブラウザから直接fetch可能
- **更新頻度:** 毎時 (毎時7分頃に生成開始、数分後に反映)
- **配信:** GitHub Pages (静的JSON)

## 2. ベースURL

```
https://moke-cloud.github.io/weather-tracker/api/v1
```

## 3. エンドポイント

### 3.1 `GET /index.json` — API情報・都市一覧

利用可能な全都市の `slug`・名称・各都市エンドポイントのURLを返します。プログラムから都市一覧を取得する場合はここを起点にしてください。

### 3.2 `GET /all.json` — 全都市サマリー

全47都市の現在気温・天気コード・頭痛リスク・傘予報要約を1リクエストで返します。一覧表示・ランキング・地図プロット向けです。

`data` は以下の要素の配列です:

```json
{
  "slug": "tokyo",
  "name": "東京 (新宿区)",
  "prefecture": "東京都",
  "url": "https://moke-cloud.github.io/weather-tracker/api/v1/cities/tokyo.json",
  "temperature": 21.6,
  "weatherCode": 1,
  "headache": { "score": 22, "level": "low", "label": "やや注意" },
  "umbrella": "明日 13時〜19時 折りたたみ傘 / 明後日 1時〜22時 傘必須"
}
```

`umbrella` は48時間以内に傘が不要な場合 `null` です。

### 3.3 `GET /cities/{slug}.json` — 都市詳細

例: `https://moke-cloud.github.io/weather-tracker/api/v1/cities/osaka.json`

## 4. 共通レスポンス形式 (envelope)

全エンドポイントは次の形式です。

```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": {
    "generatedAt": "2026-07-03T12:25:36.486Z",
    "version": "v1",
    "attribution": ["Weather data by Open-Meteo.com (CC BY 4.0)", "..."]
  }
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `success` | boolean | 生成に成功していれば `true` |
| `data` | object \| null | 本体データ |
| `error` | string \| null | エラー時のメッセージ |
| `meta.generatedAt` | string | 生成時刻 (**UTC**, ISO 8601) |
| `meta.version` | string | APIバージョン |
| `meta.attribution` | string[] | 帰属表示 (§9参照) |

## 5. 都市詳細のフィールドリファレンス

### 5.1 `data.location`

| フィールド | 型 | 説明 |
|---|---|---|
| `slug` | string | 都市識別子 (URLに使用) |
| `name` | string | 都市名 |
| `prefecture` | string | 都道府県名 |
| `latitude` / `longitude` | number | 座標 (都道府県庁位置) |

### 5.2 `data.current` / `data.hourly[]` — コンセンサス予報 (時間別)

`current` は現在時刻に最も近い1点、`hourly` は現在〜48時間先の配列です。いずれも6モデル加重平均+実測補正後の値です。

| フィールド | 型 | 単位 | 説明 |
|---|---|---|---|
| `time` | string | — | 対象時刻 (**JST**、`2026-07-03T21:00` 形式・タイムゾーン接尾辞なし) |
| `temperature` | number \| null | ℃ | 気温 |
| `apparentTemperature` | number \| null | ℃ | 体感温度 |
| `weatherCode` | number \| null | — | WMO天気コード (§7) |
| `pressureMsl` | number \| null | hPa | 海面更正気圧 |
| `precipitation` | number \| null | mm/h | 降水量 |
| `precipitationProbability` | number \| null | % | 降水確率 |
| `humidity` | number \| null | % | 相対湿度 |
| `windSpeed` | number \| null | **m/s** | 風速 (10m高度) |

### 5.3 `data.observation` — AMeDAS実測値

最寄りAMeDAS観測点の最新実測値。観測点が30km圏内に無い場合などは `null` です。

| フィールド | 型 | 単位 | 説明 |
|---|---|---|---|
| `time` | string | — | 観測時刻 (JST、`2026-07-03T21:00:00` 形式) |
| `temp` | number \| null | ℃ | 気温 |
| `humidity` | number \| null | % | 湿度 |
| `pressureSea` | number \| null | hPa | 海面更正気圧 |
| `pressureStation` | number \| null | hPa | 現地気圧 |
| `precipitation1h` | number \| null | mm | 過去1時間降水量 |
| `windSpeed` | number \| null | m/s | 風速 |
| `windDirection` | string \| null | — | 風向 (16方位の番号) |

### 5.4 `data.daily[]` — 日別予報 (当日から7日間)

| フィールド | 型 | 単位 | 説明 |
|---|---|---|---|
| `date` | string | — | 日付 (`2026-07-03`) |
| `weatherCode` | number \| null | — | WMO天気コード |
| `tempMax` / `tempMin` | number \| null | ℃ | 最高/最低気温 |
| `precipSum` | number \| null | mm | 日降水量 |
| `precipProbMax` | number \| null | % | 日最大降水確率 |
| `uvIndexMax` | number \| null | — | 日最大UV指数 |

### 5.5 `data.headacheRisk` — 頭痛リスク予測

気圧変化率・絶対気圧・気温変化・湿度・前線通過・モデル不確実性の6因子を、医学論文の閾値に基づき加重合算した参考値です。

| フィールド | 型 | 説明 |
|---|---|---|
| `score` | number | 総合スコア 0-100 (高いほどリスク大) |
| `level` | string | `safe` / `low` / `moderate` / `high` / `critical` |
| `label` | string | 日本語ラベル (安全/やや注意/注意/警戒/厳重警戒) |
| `summary` | string | 主要因の説明文 |
| `confidence` | number | 予測信頼度 0-1 (モデル・アンサンブルの充足度) |
| `factors[]` | object[] | 因子別内訳: `id`, `name`, `score` (0-100), `weight` (合計1), `description` |
| `hourly[]` | object[] | 24時間先までの推移: `time` (**UTC**, ISO 8601 `Z`付き), `score`, `level` |

レベルとスコア帯の対応:

| level | スコア | 意味 |
|---|---|---|
| `safe` | 0-15 | 安全 |
| `low` | 16-35 | やや注意 |
| `moderate` | 36-55 | 注意 |
| `high` | 56-75 | 警戒 |
| `critical` | 76-100 | 厳重警戒 |

### 5.6 `data.umbrella` — 傘予報

| フィールド | 型 | 説明 |
|---|---|---|
| `summary` | string | 結論文 (例: `明日 13時〜19時 折りたたみ傘`)。不要なら「傘の出番はなさそうです」 |
| `ranges[]` | object[] | 傘が必要な時間帯レンジ (最大48時間先まで) |

`ranges[]` の要素:

| フィールド | 型 | 説明 |
|---|---|---|
| `start` / `end` | string | レンジ開始/終了時刻 (JST、`end` の1時間を含む) |
| `level` | string | `fold` (折りたたみで十分) / `umbrella` (傘必須) / `strong` (強雨・強風。折りたたみ不可) |
| `maxProbability` | number | レンジ内最大降水確率 (%) |
| `maxPrecipitation` | number | レンジ内最大降水量 (mm/h) |
| `confidence` | number | モデル間合意度 0-1 (6モデル中いくつが雨を予測しているか) |

判定基準: `fold` = 降水確率30%以上 or 0.2mm/h以上 / `umbrella` = 60%以上 or 1mm/h以上 / `strong` = 4mm/h以上 or 雨+風速10m/s以上。降水確率はアンサンブル82メンバーの降水メンバー割合を主成分 (6:4ブレンド) にした確率値です。

### 5.7 `data.forecastSource`

| フィールド | 型 | 説明 |
|---|---|---|
| `blend` | string | ブレンド方式名 |
| `models` | string[] | 使用した決定論モデル |
| `ensembles` | string[] | 使用したアンサンブル |
| `degraded` | boolean | `true` の場合、一部モデルの取得に失敗しており通常より精度が落ちる可能性 |

## 6. 時刻形式の注意 (重要)

| 対象 | 形式 | タイムゾーン |
|---|---|---|
| `current.time`, `hourly[].time`, `daily[].date`, `observation.time`, `umbrella.ranges[].start/end` | `2026-07-03T21:00` (接尾辞なし) | **JST (Asia/Tokyo)** |
| `headacheRisk.hourly[].time`, `meta.generatedAt` | `2026-07-03T12:00:00.000Z` | **UTC** |

JavaScriptの `new Date("2026-07-03T21:00")` は**実行環境のローカルタイムゾーン**で解釈されるため、日本国外で動くサーバーで処理する場合は `+09:00` を付けて解釈してください。

## 7. WMO天気コード (weatherCode) 主要値

| コード | 天気 |
|---|---|
| 0 | 快晴 |
| 1-3 | 晴れ〜曇り |
| 45, 48 | 霧 |
| 51-57 | 霧雨 |
| 61-67 | 雨 (61弱い / 63並 / 65強い / 66-67着氷性) |
| 71-77 | 雪 |
| 80-82 | にわか雨 |
| 85-86 | にわか雪 |
| 95-99 | 雷雨 |

## 8. 使用例

### curl + jq

```bash
curl -s https://moke-cloud.github.io/weather-tracker/api/v1/cities/osaka.json |
  jq '{city: .data.location.name, temp: .data.current.temperature,
       headache: .data.headacheRisk.label, umbrella: .data.umbrella.summary}'
```

### JavaScript (ブラウザ/Node 18+)

```js
const res = await fetch('https://moke-cloud.github.io/weather-tracker/api/v1/cities/tokyo.json')
const { success, data, meta } = await res.json()
if (success) {
  console.log(`${data.location.name}: ${data.current.temperature}℃`)
  console.log(`頭痛リスク: ${data.headacheRisk.score} (${data.headacheRisk.label})`)
  console.log(`傘: ${data.umbrella.summary}`)
  console.log(`データ生成: ${meta.generatedAt}`)
}
```

### Python

```python
import requests

r = requests.get("https://moke-cloud.github.io/weather-tracker/api/v1/all.json", timeout=10)
body = r.json()
for city in body["data"]:
    if city["headache"]["level"] in ("high", "critical"):
        print(f'{city["name"]}: {city["headache"]["label"]} ({city["headache"]["score"]})')
```

## 9. 帰属表示 (必須)

このAPIのデータを表示・再配布する場合は以下を明記してください。

- Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0)
- 観測データ: 気象庁 AMeDAS

## 10. 更新タイミングとキャッシュ

- 毎時7分頃に生成ジョブが起動し、数分後に全ファイルが更新されます
- レスポンスの鮮度は `meta.generatedAt` で確認してください (最大約1時間前)
- クライアント側は**10分以上のキャッシュを推奨**します (それより短い間隔でポーリングしても内容は変わりません)

## 11. 制約・免責

- 静的ファイル配信のため、値は「リクエスト時点」ではなく「生成時点」の計算結果です
- 頭痛リスクは一般的な気象因子に基づく参考値であり、医療行為の代替にはなりません
- 個別モデルの取得失敗時は `data.forecastSource.degraded: true` になります (欠測ではなく残りモデルで生成)
- 可用性はGitHub Pagesに準拠します (SLAなし)。形式変更がある場合は `meta.version` を更新します
- 商用利用を検討される場合は、データ元であるOpen-Meteoの利用規約 (非商用無料枠) を別途ご確認ください

## 12. 都市slug一覧 (47件)

| slug | 都市 | | slug | 都市 | | slug | 都市 |
|---|---|---|---|---|---|---|---|
| sapporo | 札幌市 | | kanazawa | 金沢市 | | okayama | 岡山市 |
| aomori | 青森市 | | fukui | 福井市 | | hiroshima | 広島市 |
| morioka | 盛岡市 | | kofu | 甲府市 | | yamaguchi | 山口市 |
| sendai | 仙台市 | | nagano | 長野市 | | tokushima | 徳島市 |
| akita | 秋田市 | | gifu | 岐阜市 | | takamatsu | 高松市 |
| yamagata | 山形市 | | shizuoka | 静岡市 | | matsuyama | 松山市 |
| fukushima | 福島市 | | nagoya | 名古屋市 | | kochi | 高知市 |
| mito | 水戸市 | | tsu | 津市 | | fukuoka | 福岡市 |
| utsunomiya | 宇都宮市 | | otsu | 大津市 | | saga | 佐賀市 |
| maebashi | 前橋市 | | kyoto | 京都市 | | nagasaki | 長崎市 |
| saitama | さいたま市 | | osaka | 大阪市 | | kumamoto | 熊本市 |
| chiba | 千葉市 | | kobe | 神戸市 | | oita | 大分市 |
| tokyo | 東京 (新宿区) | | nara | 奈良市 | | miyazaki | 宮崎市 |
| yokohama | 横浜市 | | wakayama | 和歌山市 | | kagoshima | 鹿児島市 |
| niigata | 新潟市 | | tottori | 鳥取市 | | naha | 那覇市 |
| toyama | 富山市 | | matsue | 松江市 | | | |

## 13. 更新履歴

| 日付 | 内容 |
|---|---|
| 2026-07-03 | v1 公開。6モデルコンセンサス・82メンバーアンサンブル・頭痛リスク・傘予報 |
