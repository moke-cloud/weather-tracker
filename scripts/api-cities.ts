/**
 * 公開API対象都市: 47都道府県庁所在地。
 * 座標は都道府県庁の位置 (小数3桁)。slug はURLパスに使う。
 */

export interface ApiCity {
  slug: string
  name: string
  pref: string
  lat: number
  lon: number
}

export const API_CITIES: ApiCity[] = [
  { slug: 'sapporo', name: '札幌市', pref: '北海道', lat: 43.064, lon: 141.347 },
  { slug: 'aomori', name: '青森市', pref: '青森県', lat: 40.824, lon: 140.74 },
  { slug: 'morioka', name: '盛岡市', pref: '岩手県', lat: 39.704, lon: 141.153 },
  { slug: 'sendai', name: '仙台市', pref: '宮城県', lat: 38.269, lon: 140.872 },
  { slug: 'akita', name: '秋田市', pref: '秋田県', lat: 39.719, lon: 140.102 },
  { slug: 'yamagata', name: '山形市', pref: '山形県', lat: 38.24, lon: 140.364 },
  { slug: 'fukushima', name: '福島市', pref: '福島県', lat: 37.75, lon: 140.468 },
  { slug: 'mito', name: '水戸市', pref: '茨城県', lat: 36.342, lon: 140.447 },
  { slug: 'utsunomiya', name: '宇都宮市', pref: '栃木県', lat: 36.566, lon: 139.884 },
  { slug: 'maebashi', name: '前橋市', pref: '群馬県', lat: 36.391, lon: 139.061 },
  { slug: 'saitama', name: 'さいたま市', pref: '埼玉県', lat: 35.857, lon: 139.649 },
  { slug: 'chiba', name: '千葉市', pref: '千葉県', lat: 35.605, lon: 140.123 },
  { slug: 'tokyo', name: '東京 (新宿区)', pref: '東京都', lat: 35.69, lon: 139.692 },
  { slug: 'yokohama', name: '横浜市', pref: '神奈川県', lat: 35.448, lon: 139.643 },
  { slug: 'niigata', name: '新潟市', pref: '新潟県', lat: 37.902, lon: 139.023 },
  { slug: 'toyama', name: '富山市', pref: '富山県', lat: 36.695, lon: 137.211 },
  { slug: 'kanazawa', name: '金沢市', pref: '石川県', lat: 36.594, lon: 136.626 },
  { slug: 'fukui', name: '福井市', pref: '福井県', lat: 36.065, lon: 136.222 },
  { slug: 'kofu', name: '甲府市', pref: '山梨県', lat: 35.664, lon: 138.568 },
  { slug: 'nagano', name: '長野市', pref: '長野県', lat: 36.651, lon: 138.181 },
  { slug: 'gifu', name: '岐阜市', pref: '岐阜県', lat: 35.391, lon: 136.722 },
  { slug: 'shizuoka', name: '静岡市', pref: '静岡県', lat: 34.977, lon: 138.383 },
  { slug: 'nagoya', name: '名古屋市', pref: '愛知県', lat: 35.18, lon: 136.907 },
  { slug: 'tsu', name: '津市', pref: '三重県', lat: 34.73, lon: 136.509 },
  { slug: 'otsu', name: '大津市', pref: '滋賀県', lat: 35.004, lon: 135.869 },
  { slug: 'kyoto', name: '京都市', pref: '京都府', lat: 35.021, lon: 135.756 },
  { slug: 'osaka', name: '大阪市', pref: '大阪府', lat: 34.686, lon: 135.52 },
  { slug: 'kobe', name: '神戸市', pref: '兵庫県', lat: 34.691, lon: 135.183 },
  { slug: 'nara', name: '奈良市', pref: '奈良県', lat: 34.685, lon: 135.833 },
  { slug: 'wakayama', name: '和歌山市', pref: '和歌山県', lat: 34.226, lon: 135.168 },
  { slug: 'tottori', name: '鳥取市', pref: '鳥取県', lat: 35.504, lon: 134.238 },
  { slug: 'matsue', name: '松江市', pref: '島根県', lat: 35.472, lon: 133.051 },
  { slug: 'okayama', name: '岡山市', pref: '岡山県', lat: 34.662, lon: 133.934 },
  { slug: 'hiroshima', name: '広島市', pref: '広島県', lat: 34.396, lon: 132.459 },
  { slug: 'yamaguchi', name: '山口市', pref: '山口県', lat: 34.186, lon: 131.471 },
  { slug: 'tokushima', name: '徳島市', pref: '徳島県', lat: 34.066, lon: 134.559 },
  { slug: 'takamatsu', name: '高松市', pref: '香川県', lat: 34.34, lon: 134.043 },
  { slug: 'matsuyama', name: '松山市', pref: '愛媛県', lat: 33.842, lon: 132.766 },
  { slug: 'kochi', name: '高知市', pref: '高知県', lat: 33.56, lon: 133.531 },
  { slug: 'fukuoka', name: '福岡市', pref: '福岡県', lat: 33.607, lon: 130.418 },
  { slug: 'saga', name: '佐賀市', pref: '佐賀県', lat: 33.249, lon: 130.3 },
  { slug: 'nagasaki', name: '長崎市', pref: '長崎県', lat: 32.745, lon: 129.874 },
  { slug: 'kumamoto', name: '熊本市', pref: '熊本県', lat: 32.79, lon: 130.742 },
  { slug: 'oita', name: '大分市', pref: '大分県', lat: 33.238, lon: 131.613 },
  { slug: 'miyazaki', name: '宮崎市', pref: '宮崎県', lat: 31.911, lon: 131.424 },
  { slug: 'kagoshima', name: '鹿児島市', pref: '鹿児島県', lat: 31.56, lon: 130.558 },
  { slug: 'naha', name: '那覇市', pref: '沖縄県', lat: 26.212, lon: 127.681 },
]
