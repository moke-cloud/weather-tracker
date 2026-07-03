# TenkiTracker

高精度の天気・気圧トラッカー。マルチモデル予報のコンセンサス、AMeDAS実測によるバイアス補正、論文ベースの頭痛リスク予測、傘予報を1つのPWAにまとめたもの。

**アプリ:** https://moke-cloud.github.io/weather-tracker/

## 特徴

- **コンセンサス予報** — JMA MSM / ECMWF IFS / GFS の3モデルを加重平均し、AMeDAS実測との差で直近12時間を補正。予報と実測の照合ログ (MAE) が溜まると、精度の良いモデルの重みを自動で増やす
- **ECMWF 50メンバーアンサンブル** — 気圧予報の信頼帯 (P10-P90) と急降下確率
- **頭痛リスク予測** — 6因子 (気圧変化率・絶対気圧・気温変化・湿度・前線通過・モデル不確実性) の論文ベース加重モデル。頭痛日記が5件以上たまると個人の感受性に合わせて重みを自動調整
- **傘予報** — 48時間の「いつからいつまで・どのレベルの傘が必要か」を時間帯レンジで表示
- **可用性** — APIはリトライ+タイムアウト付きで取得し、3モデル一括→個別モデル→最終取得キャッシュの順にフォールバック。1つのAPIが落ちてもアプリは動き続ける
- **PWA** — オフラインキャッシュ、頭痛リスクのバックグラウンド通知 (Chromium系)

## 公開API

計算結果 (47都道府県庁所在地のコンセンサス予報・頭痛リスク・傘予報) を静的JSONで公開しています。キー不要・CORS対応・毎時更新。

```
https://moke-cloud.github.io/weather-tracker/api/v1/index.json
```

詳細は [API.md](./API.md) を参照。

## 開発

```bash
npm ci
npm run dev        # 開発サーバー
npm test           # ユニットテスト (vitest)
npm run build      # 型チェック + 本番ビルド + Service Worker ビルド
npm run build:api  # 公開API JSON生成 (dist/api/)
```

スタック: Vite 6 + React 19 + TypeScript + Tailwind CSS v4 + Recharts

## データソース

- [Open-Meteo](https://open-meteo.com/) — マルチモデル予報 / アンサンブル / 大気質 (CC BY 4.0)
- 気象庁 AMeDAS — 10分間隔の実測値
