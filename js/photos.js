/* ─────────────────────────────────────────────────────────────
   Gallery data — adding or editing photos only touches this file.
   Counts in the section heading and on the filter buttons are
   derived from this array at runtime, so never hand-edit numbers.

   file : basename of images/<file>.jpg (no extension, always lower
          case — GitHub Pages is case-sensitive)
   cat  : category; must match a data-filter value in the template
   w, h : pixel dimensions of the image. Used to reserve the tile
          via aspect-ratio so layout doesn't shift while loading.
          Only the ratio matters. tools/optimize.sh prints these.
   demo : whether a "set as phone wallpaper" screenshot exists.
          true means images/<file>_demo.jpg is present and the
          lightbox shows a toggle. Omit or set false if not.
   t    : titles per language. The page language comes from
          <html lang>, set by tools/build.py.
          Gallery tiles show t[lang] over t.en, except on the
          English page where the two would be identical and only
          one line is shown.
   ───────────────────────────────────────────────────────────── */

const PHOTOS = [
  // ── linger — drinks, desserts, tables ────────────────────
  { file: 'a_cup_of_rose', cat: 'linger', w: 2400, h: 3200, demo: true,
    t: { zh: '玫瑰一杯', en: 'A Cup of Rose', ja: '薔薇の一杯', ko: '장미의 한 잔' } },
  { file: 'a_cup_of_fingers', cat: 'linger', w: 2092, h: 3840, demo: true,
    t: { zh: '指尖一杯', en: 'A Cup of Fingers', ja: '指先の一杯', ko: '손끝의 한 잔' } },
  { file: 'blue_frozen_glow', cat: 'linger', w: 1179, h: 2080, demo: true,
    t: { zh: '冰藍微光', en: 'Blue Frozen Glow', ja: '氷藍のひかり', ko: '얼음빛 블루' } },
  { file: 'blue_frozen_glow_sip', cat: 'linger', w: 1179, h: 2372, demo: true,
    t: { zh: '冰藍微光・啜飲', en: 'Blue Frozen Glow, a Sip', ja: '氷藍のひかり・ひと口', ko: '얼음빛 블루・한 모금' } },
  { file: 'cafe_yarn', cat: 'linger', w: 1179, h: 2066, demo: true,
    t: { zh: '毛線咖啡', en: 'Café Yarn', ja: '毛糸のカフェ', ko: '실타래 카페' } },
  { file: 'caffeine_therapy', cat: 'linger', w: 1179, h: 2066, demo: true,
    t: { zh: '咖啡因療法', en: 'Caffeine Therapy', ja: 'カフェイン療法', ko: '카페인 테라피' } },
  { file: 'cocoa_space', cat: 'linger', w: 1179, h: 2061, demo: true,
    t: { zh: '可可空間', en: 'Cocoa Space', ja: 'ココアの部屋', ko: '코코아 공간' } },
  { file: 'daegu_namgu_cafe_europe', cat: 'linger', w: 1178, h: 2078, demo: true,
    t: { zh: '大邱南區・歐洲咖啡', en: 'Daegu Namgu, Café Europe', ja: '大邱 南区・カフェ ヨーロッパ', ko: '대구 남구・카페 유럽' } },
  { file: 'decibel_moka', cat: 'linger', w: 1188, h: 2563, demo: true,
    t: { zh: '分貝摩卡', en: 'Decibel Moka', ja: 'デシベル・モカ', ko: '데시벨 모카' } },
  { file: 'glass_citrus', cat: 'linger', w: 1179, h: 1623, demo: true,
    t: { zh: '玻璃柑橘', en: 'Glass Citrus', ja: 'ガラスの柑橘', ko: '유리 감귤' } },
  { file: 'gathering_in_violet', cat: 'linger', w: 1179, h: 2076, demo: true,
    t: { zh: '聚於紫色', en: 'Gathering in Violet', ja: '紫に集まる', ko: '보라에 모이다' } },
  { file: 'sweet_noir', cat: 'linger', w: 911, h: 1600, demo: true,
    t: { zh: '黑色甜蜜', en: 'Sweet Noir', ja: '黒い甘さ', ko: '검은 달콤함' } },
  { file: 'snack_vocation', cat: 'linger', w: 915, h: 1600, demo: true,
    t: { zh: '點心假期', en: 'Snack Vocation', ja: 'おやつ休暇', ko: '간식 휴가' } },
  { file: 'wood_snack', cat: 'linger', w: 917, h: 1600, demo: true,
    t: { zh: '木質點心', en: 'Wood Snack', ja: '木のおやつ', ko: '나무 위 간식' } },
  { file: 'chamomile_meets_einspanner', cat: 'linger', w: 909, h: 1600, demo: true,
    t: { zh: '洋甘菊與維也納咖啡', en: 'Chamomile Meets Einspänner', ja: 'カモミールとアインシュペナー', ko: '카밀레와 아인슈페너' } },
  { file: 'pascucci_caramel', cat: 'linger', w: 909, h: 1600, demo: true,
    t: { zh: '帕斯庫奇焦糖', en: 'Pascucci Caramel', ja: 'パスクッチのキャラメル', ko: '파스쿠찌 카라멜' } },
  { file: 'daegu_slow_turtle', cat: 'linger', w: 915, h: 1600, demo: true,
    t: { zh: '大邱 Slow Turtle', en: 'Slow Turtle, Daegu', ja: '大邱 Slow Turtle', ko: '대구 Slow Turtle' } },

  // ── travel — places with a name ──────────────────────────
  { file: 'boulevard_jourdan', cat: 'travel', w: 1179, h: 2066, demo: true,
    t: { zh: '茹爾丹大道', en: 'Boulevard Jourdan', ja: 'ジュルダン大通り', ko: '주르당 대로' } },
  { file: 'friedrichshain', cat: 'travel', w: 2400, h: 3200, demo: true,
    t: { zh: '柏林 腓特烈斯海因', en: 'Friedrichshain, Berlin', ja: 'ベルリン フリードリヒスハイン', ko: '베를린 프리드리히스하인' } },
  { file: 'konigssee', cat: 'travel', w: 2400, h: 3200, demo: true,
    t: { zh: '國王湖', en: 'Königssee', ja: 'ケーニヒス湖', ko: '쾨니히스 호수' } },
  { file: 'minxiong', cat: 'travel', w: 1326, h: 2820, demo: true,
    t: { zh: '嘉義民雄', en: 'Minxiong', ja: '嘉義 民雄', ko: '자이 민슝' } },
  { file: 'dapi_beizhen', cat: 'travel', w: 2400, h: 3200, demo: true,
    t: { zh: '大埤北鎮', en: 'Dapi Beizhen', ja: '大埤 北鎮', ko: '다피 베이전' } },
  { file: 'dakeng_scenic_area', cat: 'travel', w: 1441, h: 3021, demo: true,
    t: { zh: '台中大坑', en: 'Dakeng Scenic Area', ja: '台中 大坑', ko: '타이중 다컹' } },
  { file: 'ruifang', cat: 'travel', w: 1200, h: 1600, demo: true,
    t: { zh: '瑞芳 黃金瀑布', en: 'Golden Waterfall, Ruifang', ja: '瑞芳 黄金の滝', ko: '루이팡 황금폭포' } },
  { file: 'toucheng', cat: 'travel', w: 1200, h: 1600, demo: true,
    t: { zh: '宜蘭頭城', en: 'Toucheng', ja: '宜蘭 頭城', ko: '이란 터우청' } },
  { file: 'baisha_penghu', cat: 'travel', w: 2400, h: 1800, demo: true,
    t: { zh: '澎湖白沙', en: 'Baisha, Penghu', ja: '澎湖 白沙', ko: '펑후 바이사' } },
  { file: 'baisha_penghu_blackwhite', cat: 'travel', w: 2400, h: 1800, demo: true,
    t: { zh: '澎湖白沙・黑白', en: 'Baisha, Penghu — B&W', ja: '澎湖 白沙・モノクロ', ko: '펑후 바이사・흑백' } },
  { file: 'taehwagang_national_garden', cat: 'travel', w: 911, h: 1600, demo: true,
    t: { zh: '蔚山太和江國家庭園', en: 'Taehwagang National Garden', ja: '蔚山 太和江国家庭園', ko: '울산 태화강 국가정원' } },
  { file: 'gunsan_cafe_la_phare', cat: 'travel', w: 911, h: 1600, demo: true,
    t: { zh: '群山市 Cafe La Phare', en: 'Cafe La Phare, Gunsan', ja: '群山 Cafe La Phare', ko: '군산시・카페 라파르' } },
  { file: 'korea_road_31_pension', cat: 'travel', w: 915, h: 1600, demo: true,
    t: { zh: '慶州市 Road 31 Pension', en: 'Road 31 Pension, Korea', ja: '慶州 Road 31 Pension', ko: '경주 Road 31 Pension' } },
  { file: 'daegu_83_tower_road', cat: 'travel', w: 1178, h: 2046, demo: true,
    t: { zh: '大邱 83 塔之路', en: 'Daegu 83 Tower Road', ja: '大邱 83タワーへの道', ko: '대구 83타워 가는 길' } },
  { file: 'jeju_hueilot_stay', cat: 'travel', w: 911, h: 1600, demo: true,
    t: { zh: '濟州 Hueilot Stay', en: 'Hueilot Stay, Jeju', ja: '済州 Hueilot Stay', ko: '제주 Hueilot Stay' } },
  { file: 'huinnyeoul_seaside', cat: 'travel', w: 1179, h: 2061, demo: true,
    t: { zh: '釜山 白浪海岸', en: 'Huinnyeoul Seaside', ja: '釜山 フィニョウル海岸', ko: '부산 흰여울 해안' } },
  { file: 'suyeong_river', cat: 'travel', w: 911, h: 1600, demo: true,
    t: { zh: '釜山水營江', en: 'Suyeong River', ja: '釜山 水営江', ko: '부산 수영강' } },
  { file: 'seoul_night_bloom', cat: 'travel', w: 917, h: 1600, demo: true,
    t: { zh: '首爾夜櫻', en: 'Seoul Night Bloom', ja: 'ソウルの夜桜', ko: '서울 밤 벚꽃' } },
  { file: 'tenjin_fukuoka', cat: 'travel', w: 909, h: 1600, demo: true,
    t: { zh: '福岡天神', en: 'Tenjin, Fukuoka', ja: '福岡 天神', ko: '후쿠오카 텐진' } },

  // ── mood — no place name, light and atmosphere ───────────
  { file: 'city_trail', cat: 'mood', w: 2400, h: 3200, demo: true,
    t: { zh: '城市小徑', en: 'City Trail', ja: '街の小径', ko: '도시의 작은 길' } },
  { file: 'ginkgo_forest', cat: 'mood', w: 1178, h: 2074, demo: true,
    t: { zh: '銀杏森林', en: 'Ginkgo Forest', ja: 'イチョウの森', ko: '은행나무 숲' } },
  { file: 'petal_heart', cat: 'mood', w: 1178, h: 2069, demo: true,
    t: { zh: '花瓣之心', en: 'Petal Heart', ja: '花びらの心', ko: '꽃잎의 마음' } },
  { file: 'purple_reflection', cat: 'mood', w: 1737, h: 3140, demo: true,
    t: { zh: '紫色倒影', en: 'Purple Reflection', ja: '紫の水鏡', ko: '보랏빛 반영' } },
  { file: 'touch_the_spring', cat: 'mood', w: 911, h: 1600, demo: true,
    t: { zh: '觸碰春天', en: 'Touch the Spring', ja: '春にふれる', ko: '봄을 만지다' } },
  { file: 'under_the_petals', cat: 'mood', w: 913, h: 1600, demo: true,
    t: { zh: '花瓣之下', en: 'Under the Petals', ja: '花びらの下で', ko: '꽃잎 아래에서' } },
  { file: 'sundown', cat: 'mood', w: 1000, h: 1600, demo: true,
    t: { zh: '日落', en: 'Sundown', ja: '日暮れ', ko: '해 질 무렵' } },
  { file: 'evening_blue_by_the_sea', cat: 'mood', w: 922, h: 1600, demo: true,
    t: { zh: '海邊晚藍', en: 'Evening Blue by the Sea', ja: '海辺の夕藍', ko: '바다의 저녁빛' } },
  { file: 'stone_steps', cat: 'mood', w: 980, h: 1600, demo: true,
    t: { zh: '芒草石階', en: 'Stone Steps', ja: 'ススキの石段', ko: '억새 돌계단' } },
  { file: 'you_are_the_sunset', cat: 'mood', w: 985, h: 1600, demo: true,
    t: { zh: '你是那道夕陽', en: 'You Are the Sunset', ja: 'きみはあの夕日', ko: '너는 그 노을' } },
  { file: 'golden_path', cat: 'mood', w: 971, h: 1600, demo: true,
    t: { zh: '金色的路', en: 'Golden Path', ja: '金色の道', ko: '금빛 길' } },
  { file: 'silent_snow', cat: 'mood', w: 887, h: 1600, demo: true,
    t: { zh: '靜靜落雪', en: 'Silent Snow', ja: 'しずかに降る雪', ko: '조용히 내리는 눈' } },

  // ── anime — anime-inspired ───────────────────────────────

  // ── test — test ──────────────────────────────────────────
  { file: 'test', cat: 'test', w: 326, h: 308, demo: true,
    t: { zh: 'tset', en: 'test1', ja: 'tset', ko: 'testsq' } },
  { file: '2026_08_21_3_51_46', cat: 'test', w: 726, h: 448, demo: true,
    t: { zh: 'we', en: 'eew', ja: 'we', ko: 'we' } },
];
