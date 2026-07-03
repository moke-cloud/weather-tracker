# TenkiTracker 公開API

TenkiTracker が計算している天気コンセンサス予報・頭痛リスク予測・傘予報を、静的JSONとして公開しています。

- **ベースURL:** `https://moke-cloud.github.io/weather-tracker/api/v1`
- **認証:** 不要 (APIキーなし)
- **CORS:** 全オリジン許可 (GitHub Pages 標準)
- **更新頻度:** 毎時 (GitHub Actions cron、毎時7分頃)
- **対象:** 47都道府県庁所在地
- **形式:** 全endpoint共通 envelope `{ success, data, error, meta }`

## エンドポイント

### 1. `GET /index.json` — API情報と都市一覧

```
https://moke-cloud.github.io/weather-tracker/api/v1/index.json
```

利用可能な全都市の `slug` と各都市のURLを返します。

### 2. `GET /all.json` — 全都市サマリー

```
https://moke-cloud.github.io/weather-tracker/api/v1/all.json
```

全都市の現在気温・天気コード・頭痛リスク・傘予報の要約。一覧表示やランキング用途向け。

### 3. `GET /cities/{slug}.json` — 都市詳細

```
https://moke-cloud.github.io/weather-tracker/api/v1/cities/tokyo.json
```

| フィールド | 内容 |
|---|---|
| `data.location` | 都市名・都道府県・緯度経度 |
| `data.current` | 現在時刻のコンセンサス予報値 |
| `data.observation` | 最寄りAMeDAS観測点の実測値 (気温・湿度・海面気圧・降水・風) |
| `data.hourly` | 48時間の時間別コンセンサス予報 (気温/体感温度/天気コード/海面気圧/降水量/降水確率/湿度/風速) |
| `data.daily` | 7日間の日別予報 |
| `data.headacheRisk` | 頭痛リスク (スコア0-100、5段階レベル、6因子の内訳、24時間推移) |
| `data.umbrella` | 傘予報 (要約文と「いつからいつまで・どのレベルの傘が必要か」のレンジ) |
| `data.forecastSource` | ブレンドに使ったモデルと degraded フラグ |

`slug` の一覧は `index.json` を参照 (例: `sapporo`, `tokyo`, `nagoya`, `osaka`, `fukuoka`, `naha`)。

## 使用例

```bash
curl -s https://moke-cloud.github.io/weather-tracker/api/v1/cities/osaka.json |
  jq '{name: .data.location.name, risk: .data.headacheRisk.label, umbrella: .data.umbrella.summary}'
```

```js
const res = await fetch('https://moke-cloud.github.io/weather-tracker/api/v1/cities/tokyo.json')
const { success, data } = await res.json()
if (success) {
  console.log(data.headacheRisk.score, data.umbrella.summary)
}
```

## データの性質と注意

- コンセンサス予報は JMA MSM / ECMWF IFS 0.25° / GFS の3モデル加重平均に、AMeDAS実測によるバイアス補正を加えたものです。短期はJMA、3日目以降はECMWFを重視します。
- 頭痛リスクは医学論文の閾値に基づく参考値であり、医療行為の代替にはなりません。
- 静的JSONのため、リクエスト時点ではなく `meta.generatedAt` 時点の計算結果です (最大約1時間前)。
- レベル定義: 頭痛リスクは `safe / low / moderate / high / critical` の5段階。傘予報レンジの `level` は `fold` (折りたたみ) / `umbrella` (傘必須) / `strong` (強雨・強風)。

## 帰属表示

このAPIのデータを再配布・表示する場合は以下を明記してください。

- Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0)
- 観測データ: 気象庁 AMeDAS
