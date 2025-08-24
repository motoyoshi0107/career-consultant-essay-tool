/* =========================================================
  キャリコン論述：事例記録ジェネレーター（CCC / JCDA）
  - 静的（無料）で動作
  - 軸マトリクス合成 + 重複防止（Jaccard + 差分軸）
  - 逆頻度重み / シード対応
========================================================= */

// ---------- 小ユーティリティ ----------
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const choice = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const weightedChoice = (rng, items, weights) => {
  if (!weights || weights.length !== items.length) return choice(rng, items);
  const sum = weights.reduce((a,b)=>a+b,0);
  let r = rng()*sum, c=0;
  for (let i=0;i<items.length;i++){ c+=weights[i]; if(r<=c) return items[i]; }
  return items[items.length-1];
};

// 決定的RNG（seed対応）
function xmur3(str){ let h=1779033703 ^ str.length; for (let i=0;i<str.length;i++){ h=Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h<<13)|(h>>>19); } return function(){ h=Math.imul(h ^ (h>>>16), 2246822507); h=Math.imul(h ^ (h>>>13), 3266489909); return (h ^ (h>>>16))>>>0; };}
function mulberry32(a){ return function(){ let t = a += 0x6D2B79F5; t = Math.imul(t ^ (t>>>15), 1 | t); t ^= t + Math.imul(t ^ (t>>>7), 61 | t); return ((t ^ (t>>>14)) >>> 0) / 4294967296; };}
function createRNG(seedStr){ const seed = xmur3(seedStr||String(Date.now()))(); return mulberry32(seed); }

// ---------- 軸データ（最小セット：必要に応じて拡張） ----------
const AXES = {
  mainComplaint: [
    "転職の意思決定ができない", "評価への不満と不信", "役割葛藤（家庭と仕事）", "燃え尽き感（モチベ低下）",
    "上司・同僚との関係不全", "将来像が描けない", "健康面の不安と業務の両立", "業務量過多で継続困難",
    "生活の芯が抜けた感覚", "生活リズムの乱れ", "社会とのつながりの希薄化", "収入への漠然とした不安",
    "定年後の生活設計への迷い", "優先順位のつけ方が定まらない", "基準づくりで足踏み",
    "役割の期待が曖昧なまま負荷増加", "数値責任と部下育成の両立困難", "チーム内の摩擦と睡眠不調",
    "何を捨て何を残すかの基準が定まらない", "自分の意思決定の遅れ", "仕事の手応えが薄い感覚",
    "役割の定義ができていない", "期末まで流される恐怖感", "介護とシフト勤務の両立困難",
    "役割と時間配分の基準が作れない", "判断が止まり手順が決まらない", "罪悪感の両方向からの挟み撃ち",
    "制度利用の条件が頭に入ってこない", "何を優先すべきか基準が決められない",
    "新ツールやデータ活用への苦手意識", "評価基準変更への適応困難", "次は自分が対象の不安",
    "最初の一歩が出ない状態", "何を捨て何を残すか見当がつかない", "古いやり方にしがみつく嫌気",
    "教材も書類も開く手が止まる", "デジタル画面を開くと固まる", "入社1年未満で仕事がつらく退職検討",
    "短期離職は不利で踏み切れない", "やりたい仕事が特に定まらない", "続ける辞めるの判断軸が持てない",
    "何を基準に決めればいいか分からない", "慣れないまま9か月が過ぎた感覚", "耐え続けるだけの毎日から離れたい"
  ],
  triggers: [
    "上司交代", "人事制度改定", "AI導入による職務再設計", "育休からの復帰", "親の要介護認定2",
    "単身赴任開始", "大型プロジェクト炎上", "事業部の統廃合", "評価基準の変更", "営業エリア拡大",
    "定年退職（1年経過）", "両親の体調変化", "友人関係の希薄化", "管理組合理事の当番開始",
    "同僚との連絡が年数回に減少", "生活費の見直し必要性", "期の途中で昇格", "OKR定義の変更",
    "在宅比率の低下", "部下の配属・増員", "プレイングマネージャーへの役割変更",
    "父の入院・退院", "母の腰痛悪化", "要介護2認定", "センター統合", "在庫管理システム刷新",
    "妻の在宅比率低下", "部署再編で業務負荷増加見込み", "部門でのAI一気導入",
    "先輩2人の早期退職", "間接部門の人員削減方針", "評価シートにデジタル活用KPI追加",
    "リスキリング講座の導入", "新ダッシュボードシステム導入",
    "新卒入社から9か月経過", "ITベンチャーのハイペース環境", "残業月40時間の日常化",
    "新技術習得プレッシャー", "同期との成長差の実感", "理想と現実のギャップ拡大"
  ],
  constraints: [
    "通勤が往復90分以上", "保育園送迎が必要", "夜間オンコールあり", "月2回の出張固定",
    "家計の学費負担が重い", "持病の通院が月2回", "役割上の残業が常態化", "在宅比率が20%に減少",
    "両親の通院付き添い（週2回）", "管理組合理事の当番", "デジタル手続きへの不安", 
    "年齢による就職への不安", "履歴書作成から詰まる", "オンライン応募の作法が曖昧",
    "住宅ローンの返済", "保育園継続の必要性", "部下フォローの時間確保", "会議の詰まり",
    "夕方以降の自分作業時間", "保育園迎え対応", "睡眠時間の確保困難",
    "実家まで車で40分の距離", "遅番21時上がり後の実家到着22時過ぎ", "シフト希望が通らない",
    "夜間トラブル対応の電話", "長男の塾送迎（火木）", "妻の早出繁忙期", 
    "月35-45時間の残業常態", "教育係兼務での計画外対応", "人手不足による負荷増",
    "住宅ローン残12年", "長男（16）・次男（13）の受験・部活費用", "塾代負担",
    "母の通院付き添い月2回", "エクセル中心の従来業務", "新ツールの専門用語理解困難",
    "オンライン講座の理解困難", "質問フォーム記入で躓く", "年齢による転職市場の制約",
    "短期離職履歴の心配", "奨学金返済月5万円", "一人暮らし生活費の負担",
    "転職活動時間の確保困難", "実家からの期待とプレッシャー", "同期との比較による焦燥感",
    "新卒カードを使い切ったという後悔", "スキル不足の実感", "業界理解の浅さ"
  ],
  valueConflicts: [
    "安定 vs 成長", "年収 vs 時間", "家族役割 vs 昇格", "専門性維持 vs ジェネラリスト化",
    "やりがい vs 貢献実感の薄さ", "内省時間 vs 即時成果", "収入確保 vs 時間の自由",
    "自分の時間 vs 両親への支援", "安定した生活 vs 新しい挑戦", "責任回避 vs 積極的関与",
    "プレイヤー業務 vs マネジメント業務", "数値責任 vs 部下育成", "完璧主義 vs 現実的対応",
    "現職継続 vs 転職・異動", "家庭時間 vs 残業対応", "部下への指導 vs 権限移譲",
    "親の介護 vs 子の教育", "仕事継続 vs 制度利用", "現場責任 vs 家族責任",
    "収入維持 vs 時短勤務", "介護サービス利用 vs 家族介護", "職場での立場 vs 家族のニーズ",
    "実家支援の優先 vs 子の送迎対応", "妻の負担軽減 vs 自分の負担軽減",
    "従来手法の維持 vs デジタル化適応", "経験による品質 vs 効率化要求",
    "現職継続 vs 異動・転職", "安定雇用 vs スキル更新", "学習意欲 vs 学習困難感",
    "プライド vs 現実受容", "年功序列価値観 vs 成果主義適応",
    "安定継続 vs 新しい挑戦", "我慢継続 vs 早期転職", "理想追求 vs 現実適応",
    "成長実感 vs 即戦力期待", "自分らしさ vs 組織適応", "完璧主義 vs 妥協受容"
  ],
  family: [
    "単身赴任", "妻（専業）・子1（5）", "共働き・子2（7,3）", "DINKs", "ひとり親・子1（9）", "親と同居（要支援1）",
    "独身・1人暮らし・両親同市内", "独身・両親要支援", "夫婦のみ・両親遠方", "配偶者と死別・独居",
    "妻・幼児（3歳）", "妻（共働き）・幼児", "妻（時短勤務）・子供", "夫婦・住宅ローンあり",
    "妻・長男（12）・長女（8）", "共働き・子2・両親要介護", "中学生・小学生の子育て世代",
    "両親同県内・要介護2", "きょうだい他県・介護分担困難", "妻フルタイム・子供思春期",
    "妻・長男（16）・次男（13）", "持ち家・ローン残12年", "高校生・中学生の教育費期",
    "両親車で30分・通院付き添い必要", "受験・部活費用が高額",
    "独身・一人暮らし・両親実家", "大学時代の奨学金返済中", "実家からの期待と経済支援",
    "友人関係の構築途中", "社会人として自立過程"
  ],
  employment: ["正社員", "契約社員", "派遣社員", "業務委託", "副業あり", "定年退職・無職", "早期退職", "嘱託再雇用",
    "プレイングマネージャー", "中間管理職", "チームリーダー", "主任・係長級", "シフト勤務正社員", "現場管理職", "教育係兼務",
    "係長級・間接部門", "営業企画職", "希望退職対象予備軍", "新卒正社員・9か月目", "ITベンチャー企業勤務"],
  workStyle: ["在宅50%", "在宅10%", "完全出社", "シフト制", "夜間オンコール月4回", "出張月2回",
    "週2-3日・午前中心", "短時間パート希望", "ボランティア活動", "地域活動参加",
    "在宅比率低下後の出社", "夕方以降の自分作業", "部下フォロー中心", "会議詰まり常態",
    "遅番・土曜勤務増加", "21時上がりシフト", "夜間トラブル対応あり", "シフト希望通らず",
    "エクセル中心の従来業務", "AI・デジタルツール導入後", "会議で黙る時間増加", "確認が細かくなった業務",
    "毎日残業40時間ペース", "新技術キャッチアップに追われる", "同期との進捗差を実感", "ベンチャー企業の高速環境"],
  industries: ["医療", "IT", "製造", "教育", "介護", "物流", "小売", "広告", "金融", "行政",
    "日用品メーカー", "観光案内", "図書館", "地域ボランティア", "NPO・社会福祉",
    "総合商社", "マーケティング", "コンサルティング", "EC向け物流", "倉庫運営", "配送センター",
    "生活用品メーカー", "間接部門（本社）", "AI導入業界", "ITベンチャー", "スタートアップ"],
  jobs: ["営業", "企画", "バックオフィス", "技術職", "クリエイティブ", "診療放射線技師", "看護職", "SE", "PM", "人事",
    "英文チェック", "後輩育成", "事務・校正", "観光案内", "図書館スタッフ",
    "商社営業", "マーケティング部", "プレイングマネージャー", "チームリーダー",
    "倉庫運営", "物流センター運営", "人員計画", "在庫管理", "教育係",
    "Webエンジニア", "システム開発", "UI/UX設計", "データ分析", "新卒エンジニア",
    "営業15年経験", "本社営業企画8年", "係長職", "需要予測業務", "販促文作成"],
  laws: ["育児介護休業法", "短時間勤務制度", "36協定", "ジョブ型人事", "目標管理制度", "歩合給規程", "評価ランク制度",
    "OKR制度", "プレイングマネージャー制", "成果主義人事", "コンピテンシー評価", "360度評価制度",
    "介護休業93日・分割可", "介護休暇制度", "短時間勤務による賃金減", "通所リハ・訪問介護選択",
    "デジタル活用KPI", "リスキリング支援制度", "希望退職制度", "配置転換制度", "AI業務効率化方針"],
  timeAxis: ["直近3か月で変化", "半期の評価直前", "決算期に向けて繁忙", "年度替わりの配置転換", "資格試験が近い", "子の進学時期",
    "定年退職から1年経過", "半年後の人事異動期", "年金受給開始時期", "両親の介護保険申請時期",
    "管理組合理事任期中", "生活費見直し時期", "期の途中", "四半期末の数値締め",
    "部下の評価時期", "昇格から3か月後", "チーム再編成時期", "父の入院・退院後", "要介護認定後",
    "センター統合直後", "システム刷新教育期", "部署再編前の準備期", "ケアマネ選定時期",
    "AI導入から3か月後", "先輩2人早期退職直後", "リスキリング講座締切前", "希望退職募集時期",
    "長男高校受験期", "次男中学受験期", "教育費ピーク期"],
  psych: ["焦燥", "罪悪感", "孤立感", "自己効力感の低下", "将来不安", "過剰適応",
    "生活の芯が抜けた感覚", "足踏み状態", "心が折れる感覚", "達成感を得る瞬間の減少",
    "落ち着かない気持ち", "見通しが立たない不安", "睡眠不調・睡眠が浅い",
    "頭が散らかった感じ", "手応えが薄い感覚", "期末まで流される恐怖", "カフェイン依存傾向",
    "子との関わりへの罪悪感", "自分の強みが曖昧になる感覚", "家族の空気が重くなる感覚",
    "実家優先への罪悪感と優先しなかった罪悪感", "翌朝のつらさ", "疲れが見透かされる感覚",
    "制度の条件が頭に入らない混乱", "手を出す順番が決まらない焦り", "胃が重い感覚",
    "新ツール画面で固まる", "専門用語が分からない焦り", "会議で黙る時間の増加",
    "若手との技術格差への焦り", "業界ニュースで胸がざわつく", "SNS記事で怖くなる感覚",
    "古いやり方への嫌気と固執", "質問を躊躇する心理", "次は自分が切られる恐怖",
    "適応できない自分への失望", "同期との比較で劣等感", "新卒カードを無駄にした後悔",
    "実家への申し訳なさ", "将来への漠然とした不安", "スキル不足への焦り",
    "業界理解の浅さへの恥ずかしさ", "転職への罪悪感と期待", "早期離職への社会的不安",
    "自分らしさが分からない混乱"],
  supports: ["社内メンター", "同僚の支え", "配偶者の協力", "公的相談機関", "外部講座", "上司の理解",
    "前職での英文チェック経験", "年金・貯蓄", "管理組合での役割", "両親との関係",
    "近所との関係", "自治会での活動経験", "転職サイトの活用", "妻のサポート",
    "提案構造化のスキル", "商社営業7年の経験", "地方支社2年の経験", "プレイヤー実績",
    "上司との面談機会", "チーム内での相談", "ケアマネージャー", "姉（他県だが協力的）",
    "物流11年のキャリア", "在庫管理システムの知識", "36協定の枠内での調整",
    "介護休業・短時間勤務制度", "通所リハ・訪問介護の選択肢", "異動の可能性",
    "営業15年の経験", "営業企画8年の実績", "エクセル活用スキル", "需要予測の知見",
    "販促文作成経験", "上司の「キャッチアップすれば大丈夫」発言", "リスキリング講座制度",
    "試用アカウントの提供", "現場営業への復帰選択肢", "異動願い提出の可能性",
    "転職サイト活用", "家族のサポート（妻・子供）", "業界知識と人脈",
    "実家からの経済的支援", "大学時代の友人関係", "先輩社員からの指導",
    "研修制度・メンター制度", "転職サイト・エージェント", "学習コミュニティ参加",
    "プログラミングの基礎スキル", "同期との情報交換", "キャリアセンター相談"]
};

// 接続詞・言い換え（軽量辞書）
const PHRASES = {
  connect: ["一方で", "加えて", "その結果", "したがって", "まず", "次に", "総じて"],
  modals: ["と捉える", "とみられる", "が示唆される", "と考える", "の可能性が高い"],
  intents: ["受容", "感情の言語化", "焦点化", "リフレーミング", "意思決定支援", "資源の想起"],
  timeAxis: ["最近になって", "ここ数か月で", "今年に入って", "転職を機に", "昇進してから", "コロナ禍以降"]
};

// ---------- 履歴・重複防止 ----------
const HISTORY_KEY = "rondoku_history_v1";
const FREQ_KEY = "rondoku_freq_v1";
const MAX_HISTORY = 30;
function loadStorage(key, fallback){ try{ return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }catch(e){ return fallback; } }
function saveStorage(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

let historySignatures = loadStorage(HISTORY_KEY, []);
let freqMap = loadStorage(FREQ_KEY, {}); // { token: count }

function tokensFromCase(meta){
  // 軸トークン + 数値ビン
  const careerYear = Math.max(meta.age - 22, 5); // 最低5年のキャリア
  const overtime = Math.floor(Math.random() * 6) * 10; // 0-50h
  const bins = [
    `age_${Math.floor(meta.age/5)*5}`, // 5歳刻み
    `ot_${Math.floor(overtime/10)*10}`, // 残業 10h刻み
    `tenure_${Math.floor(careerYear/2)*2}`
  ];
  const axes = [
    meta.mainComplaint, meta.trigger, meta.constraint, meta.valueConflict,
    meta.family, meta.employment, meta.workStyle, meta.industry, meta.job, meta.law, meta.timeAxis
  ];
  return new Set([...axes, ...bins]);
}

function jaccard(setA, setB){
  const a = setA.size, b = setB.size; let inter = 0;
  for (const t of setA){ if (setB.has(t)) inter++; }
  const uni = a + b - inter;
  return uni === 0 ? 0 : inter / uni; // 1: 完全一致, 0: 完全不一致
}

function noveltyScore(sig, recent){
  // 0=同じ, 1=全然違う → 我々は 1 - Jaccard を主に見る
  if (recent.length === 0) return 1;
  const scores = recent.map(prev => 1 - jaccard(sig, new Set(prev)));
  // 直近の中で最も似ているものに合わせてスコア決定（保守的）
  return Math.min(...scores);
}

function updateHistory(sig, usedTokens){
  const arr = Array.from(sig);
  historySignatures.unshift(arr);
  if (historySignatures.length > MAX_HISTORY) historySignatures.pop();
  saveStorage(HISTORY_KEY, historySignatures);

  for (const t of usedTokens){
    freqMap[t] = (freqMap[t] || 0) + 1;
  }
  saveStorage(FREQ_KEY, freqMap);
}

function inverseFreqWeights(options){
  // w = 1 / sqrt(freq+1)
  return options.map(opt => 1 / Math.sqrt((freqMap[opt] || 0) + 1));
}

// ---------- 整合性ルール ----------
function coherent(meta){
  // 年齢と子年齢（familyに数値が含まれる場合の粗いチェック）
  const childAges = (meta.family.match(/[（(]?\s*\d+\s*[）)]?/g) || []).map(s => parseInt(s.replace(/\D/g,''), 10)).filter(Boolean);
  for (const ca of childAges){
    if (meta.age - ca < 16) return false; // 親年齢差があまりに小さい場合はNG
  }
  // 業界×働き方（病院で完全フルリモートは低確率→NG扱い）
  if (meta.industry === "医療" && meta.workStyle === "在宅50%") return false;

  // 制度×状況の矛盾（短時間勤務と夜間オンコール常態の同時は避ける）
  if (meta.law === "短時間勤務制度" && /夜間オンコール/.test(meta.workStyle)) return false;

  return true;
}

function minAxisDifference(metaA, metaB){
  // 直前との「異なる軸数」を数え、4軸以上の差を要求
  let diff = 0;
  const keys = ["mainComplaint","trigger","constraint","valueConflict","family","employment","workStyle","industry","job","law","timeAxis"];
  for (const k of keys){
    if (metaA[k] !== metaB[k]) diff++;
  }
  return diff >= 4;
}

// ---------- テーマ別メタデータマッピング ----------
function getThemeMetadata(theme) {
  const themeMap = {
    "転職・キャリア転機": {
      mainComplaint: ["転職活動に不安を感じる", "キャリアチェンジの方向性が見えない", "現職での成長限界を感じる", "今の職場では将来性が見えない", "自分に合った職場を見つけたい"],
      triggers: ["昇進の見込みがない", "業界の将来性への不安", "スキルの停滞感", "給与や待遇への不満", "職場環境の変化"],
      constraints: ["家族の生活を支える責任", "年齢的な転職の難しさ", "経験の浅い分野への挑戦", "現在の収入を維持する必要性"],
      valueConflicts: ["安定性と成長機会の両立", "現職の人間関係と新しい挑戦", "収入維持と働きがい", "慣れ親しんだ環境と新しい可能性"],
      timeAxis: ["転職タイミングの見極め", "キャリア計画の見直し時期"],
      workStyle: ["通勤型", "フレックス勤務", "リモート併用"],
      employment: ["正社員", "契約社員"]
    },
    "ワークライフバランス": {
      mainComplaint: ["仕事と私生活の両立が困難", "長時間労働による疲労感", "家族時間の確保が難しい"],
      triggers: ["残業時間の増加", "家族からの不満", "体調不良の兆候"],
      constraints: ["業務量の多さ", "職場の人手不足", "責任あるポジション"],
      valueConflicts: ["仕事の責任と家庭への配慮", "キャリア向上と健康維持", "組織への貢献と個人時間"],
      family: ["夫婦", "夫婦+子ども1人", "夫婦+子ども2人", "三世代同居"],
      workStyle: ["通勤型", "フレックス勤務", "リモート併用"],
      timeAxis: ["育児期間中", "両親の高齢化時期", "昇進後の責任増大時期"]
    },
    "職場の人間関係・役割葛藤": {
      mainComplaint: ["職場の人間関係に悩んでいる", "複数の役割の板挟み状態", "チーム内での立ち位置に困惑", "上司や部下との関係に悩んでいる", "管理職としての重圧を感じる"],
      triggers: ["上司との価値観の違い", "同僚との業務分担トラブル", "部下との世代間ギャップ", "昇格による責任の変化", "評価制度への対応"],
      constraints: ["組織の人事異動制限", "既存の人間関係の維持", "職場の雰囲気", "管理職としての立場", "成果と人間関係の両立"],
      valueConflicts: ["個人の価値観と組織文化", "公平性と人情", "効率性と協調性", "業績と部下育成", "自分の意見と組織の方針"],
      jobs: ["管理職", "チームリーダー", "主任・係長級", "中間管理職"],
      timeAxis: ["組織変革期", "新体制移行期", "世代交代時期", "昇格直後", "チーム再編時期"]
    },
    "メンタル不調・適応困難": {
      mainComplaint: ["気分の落ち込みが続いている", "仕事への意欲低下を感じる", "睡眠や食事に影響が出ている", "職場に馴染めない", "新しい環境に適応できない", "理想と現実のギャップに悩んでいる"],
      triggers: ["過重な業務負荷", "職場でのハラスメント", "重要な失敗体験", "上司からの厳しい指導", "同期との能力差を実感", "職場環境の大幅変化"],
      constraints: ["休職への不安", "職場復帰の懸念", "医療機関受診への抵抗", "経験不足", "転職市場での不利", "周囲からの期待"],
      valueConflicts: ["責任感と自己保護", "周囲への迷惑と自分の健康", "仕事継続と治療優先", "忍耐と自分らしさ", "安定志向と挑戦願望"],
      workStyle: ["通勤型", "フレックス勤務"],
      timeAxis: ["症状出現初期", "悪化防止の重要時期", "入社1年目", "試用期間中", "環境変化直後"],
      employment: ["正社員", "契約社員"]
    },
    "育児と仕事の両立": {
      mainComplaint: ["育児と仕事の両立に疲れを感じる", "子どもとの時間が十分取れない", "保育園のお迎え時間に間に合わない"],
      triggers: ["子どもの体調不良による休み", "保育園からの呼び出し", "夜泣きによる睡眠不足"],
      constraints: ["保育園のお迎え時間", "子どもの急な発熱対応", "配偶者の協力度"],
      valueConflicts: ["仕事の責任と子育ての責任", "キャリア継続と子どもの成長見守り", "経済的必要性と育児専念願望"],
      family: ["夫婦+子ども1人", "夫婦+子ども2人", "ひとり親+子ども1人", "ひとり親+子ども2人"],
      workStyle: ["フレックス勤務", "時短勤務", "リモート併用"],
      employment: ["正社員", "パート・アルバイト", "契約社員"],
      timeAxis: ["育児休暇復帰直後", "子どもの入園・入学時期"]
    },
    "介護と仕事の両立": {
      mainComplaint: ["親の介護と仕事の両立が困難", "介護による精神的負担が大きい", "将来の介護計画が立てられない"],
      triggers: ["親の要介護度上昇", "介護サービスの不足", "兄弟姉妹との役割分担問題"],
      constraints: ["介護サービス利用時間の制限", "経済的負担の増加", "介護施設の空き状況"],
      valueConflicts: ["仕事の継続と親への義務", "自分の生活と介護責任", "経済的安定と介護専念"],
      family: ["夫婦+親1人", "夫婦+親2人", "三世代同居"],
      workStyle: ["フレックス勤務", "リモート併用", "通勤型"],
      timeAxis: ["介護初期段階", "要介護度変化時期"],
      employment: ["正社員", "契約社員"]
    },
    "スキル・成長停滞": {
      mainComplaint: ["スキルの成長が実感できない", "同じ業務の繰り返しに飽きを感じる", "キャリアの方向性が見えない", "新しい技術についていけない", "従来のスキルが通用しなくなった"],
      triggers: ["新しい技術への対応要求", "同期や後輩の昇進", "業務のマンネリ化", "社内システムの大幅変更", "AIツール導入の通知", "技術格差の拡大"],
      constraints: ["学習時間の確保困難", "会社の研修制度不足", "新しい分野への挑戦機会不足", "学習能力への不安", "サポート体制の不足"],
      valueConflicts: ["安定と成長への挑戦", "現在のスキルと新技術習得", "効率性と学習投資", "従来の経験と新技術", "変化への適応と安定志向"],
      jobs: ["SE・プログラマー", "事務職", "営業職", "技術職", "管理職"],
      timeAxis: ["キャリア中期の停滞期", "技術変革期", "DX推進期", "システム移行期"]
    },
    "セカンドキャリア・定年後": {
      mainComplaint: ["定年後の生きがいが見つからない", "経済的な不安がある", "健康面での制約を感じる", "社会とのつながりが薄れている", "生活リズムが整わない"],
      triggers: ["定年退職の通知", "年金受給額の確定", "健康診断の結果", "配置転換の通知", "希望退職の募集"],
      constraints: ["年齢による就職困難", "体力・健康面の制約", "新しい技術への適応困難", "収入減への不安", "社会的役割の変化"],
      valueConflicts: ["経済的必要性と生きがい追求", "家族との時間と社会貢献", "プライドと現実的選択", "経験を活かすことと新しい挑戦"],
      employment: ["嘱託社員", "パート・アルバイト", "無職"],
      timeAxis: ["定年退職前後", "年金受給開始時期", "再雇用期間", "完全退職後"],
      family: ["夫婦", "夫婦+親1人", "夫婦+親2人", "三世代同居"]
    }
  };

  return themeMap[theme] || {};
}

// ---------- メタ生成 ----------
function sampleMeta(rng, input){
  // テーマに基づく適切なメタデータ選択
  const themeMetaMap = getThemeMetadata(input.theme);
  
  // テーマに基づいて適切な選択肢を絞り込み、逆頻度重みを適用
  const mc = themeMetaMap.mainComplaint ? 
    weightedChoice(rng, themeMetaMap.mainComplaint, inverseFreqWeights(themeMetaMap.mainComplaint)) :
    weightedChoice(rng, AXES.mainComplaint, inverseFreqWeights(AXES.mainComplaint));
  const tr = themeMetaMap.triggers ?
    weightedChoice(rng, themeMetaMap.triggers, inverseFreqWeights(themeMetaMap.triggers)) :
    weightedChoice(rng, AXES.triggers, inverseFreqWeights(AXES.triggers));
  const cs = themeMetaMap.constraints ?
    weightedChoice(rng, themeMetaMap.constraints, inverseFreqWeights(themeMetaMap.constraints)) :
    weightedChoice(rng, AXES.constraints, inverseFreqWeights(AXES.constraints));
  const vc = themeMetaMap.valueConflicts ?
    weightedChoice(rng, themeMetaMap.valueConflicts, inverseFreqWeights(themeMetaMap.valueConflicts)) :
    weightedChoice(rng, AXES.valueConflicts, inverseFreqWeights(AXES.valueConflicts));
  
  // 家族構成の選択（テーマとの整合性チェック）
  let fam = input.family?.trim() ? input.family.trim() : 
    (themeMetaMap.family ? 
      weightedChoice(rng, themeMetaMap.family, inverseFreqWeights(themeMetaMap.family)) :
      weightedChoice(rng, AXES.family, inverseFreqWeights(AXES.family)));
  
  // テーマと家族構成の矛盾チェック・修正
  if (input.theme === "育児と仕事の両立" && fam === "単身") {
    fam = choice(rng, ["夫婦+子ども1人", "夫婦+子ども2人", "ひとり親+子ども1人"]);
  }
  if (input.theme === "介護と仕事の両立" && fam === "単身") {
    fam = choice(rng, ["夫婦+親1人", "夫婦+親2人", "三世代同居"]);
  }
  if (input.theme === "セカンドキャリア・定年後" && fam === "単身") {
    fam = choice(rng, ["夫婦", "夫婦+親1人", "三世代同居"]);
  }
  
  const emp = themeMetaMap.employment ?
    weightedChoice(rng, themeMetaMap.employment, inverseFreqWeights(themeMetaMap.employment)) :
    weightedChoice(rng, AXES.employment, inverseFreqWeights(AXES.employment));
  const ws = themeMetaMap.workStyle ?
    weightedChoice(rng, themeMetaMap.workStyle, inverseFreqWeights(themeMetaMap.workStyle)) :
    weightedChoice(rng, AXES.workStyle, inverseFreqWeights(AXES.workStyle));
  
  const ind = input.industry?.trim() ? input.industry.trim() : 
    (themeMetaMap.industries ?
      weightedChoice(rng, themeMetaMap.industries, inverseFreqWeights(themeMetaMap.industries)) :
      weightedChoice(rng, AXES.industries, inverseFreqWeights(AXES.industries)));
  const job = input.job?.trim() ? input.job.trim() : 
    (themeMetaMap.jobs ?
      weightedChoice(rng, themeMetaMap.jobs, inverseFreqWeights(themeMetaMap.jobs)) :
      weightedChoice(rng, AXES.jobs, inverseFreqWeights(AXES.jobs)));
  
  const law = weightedChoice(rng, AXES.laws, inverseFreqWeights(AXES.laws));
  const tx = themeMetaMap.timeAxis ?
    weightedChoice(rng, themeMetaMap.timeAxis, inverseFreqWeights(themeMetaMap.timeAxis)) :
    weightedChoice(rng, AXES.timeAxis, inverseFreqWeights(AXES.timeAxis));
  const ot = randInt(rng, 5, 60);      // 残業時間
  const tenure = randInt(rng, 0, 15);  // 勤続年数

  // 年齢とテーマの整合性チェック・修正
  let adjustedAge = input.age;
  if (input.theme === "メンタル不調・適応困難" && adjustedAge > 35) {
    // 新卒適応困難パターンも含むため、若めに調整
    adjustedAge = randInt(rng, 22, 35);
  }
  if (input.theme === "セカンドキャリア・定年後" && adjustedAge < 55) {
    adjustedAge = randInt(rng, 55, 70);
  }
  if (input.theme === "スキル・成長停滞" && adjustedAge < 30) {
    // 中堅以上の年代が対象
    adjustedAge = randInt(rng, 30, 60);
  }

  return {
    mode: input.mode,
    gender: input.gender,
    age: adjustedAge,
    family: fam,
    theme: input.theme,
    industry: ind,
    job,
    mainComplaint: mc,
    trigger: tr,
    constraint: cs,
    valueConflict: vc,
    employment: emp,
    workStyle: ws,
    law,
    timeAxis: tx,
    overtime: ot,
    tenure
  };
}

// ---------- ケース生成マトリクス（体系的属性管理） ----------
const CASE_MATRIX = {
  // ①基礎属性（ケースの土台）
  foundation: {
    demographics: {
      age_band: ["20代", "30代", "40代", "50代", "60代"],
      gender: ["男性", "女性", "非回答"],
    },
    work_profile: {
      industry: [
        "医療", "IT・システム", "製造", "教育", "金融", "商社・流通", 
        "サービス", "公務", "建設・不動産", "メディア・広告", "運輸・物流"
      ],
      role: [
        "営業", "企画・マーケティング", "SE・プログラマー", "看護職", 
        "診療放射線技師", "管理・経営", "専門職", "事務・アシスタント",
        "製造・技術", "教育・研修", "人事・労務", "経理・財務"
      ],
      employment: ["正社員", "契約社員", "派遣", "業務委託", "副業・複業"],
      tenure_years: ["0-1年", "2-5年", "6-10年", "11-20年", "20年超"],
    },
    work_style: {
      remote_ratio: ["完全出社", "在宅20%", "在宅50%", "在宅80%", "完全リモート"],
      shift_type: ["固定時間", "シフト制", "フレックス", "裁量労働", "変形労働時間"],
      travel_frequency: ["なし", "月1-2回", "週1回", "常時出張"],
      oncall: ["なし", "夜間オンコール月2回", "休日対応あり", "24時間体制"]
    },
    family_status: [
      "単身", "夫婦のみ（DINKs）", "乳幼児育児中", "小学生育児中", 
      "中高生育児中", "親の介護中", "単身赴任中", "共働き夫婦"
    ],
    quantitative_metrics: {
      overtime_bands: ["月10時間未満", "月11-30時間", "月31-50時間", "月51-80時間", "月80時間超"],
      commute_time: ["30分未満", "30-60分", "60-90分", "90分超"],
      income_ranges: ["年収300万未満", "年収300-500万", "年収500-700万", "年収700-1000万", "年収1000万超"]
    }
  },

  // ②状況変化・トリガー（今を作った要因）
  triggers: {
    organizational: [
      "上司・管理職の交代", "人事評価制度の改定", "組織再編・部署統合", 
      "AI・DXツール導入", "異動・配置転換", "目標設定の大幅変更",
      "事業の統廃合", "人員削減・リストラ", "働き方制度の変更"
    ],
    personal_life: [
      "育児休業からの復帰", "子どもの進学・受験", "親の要介護認定", 
      "配偶者の転勤・転職", "健康状態の変化", "単身赴任の開始・終了",
      "家族構成の変化", "住居の変更・引越し"
    ],
    timeline_pressure: [
      "半期評価・査定時期", "決算期の繁忙", "昇格・昇進試験直前", 
      "契約更新時期", "プロジェクト大型案件", "年度末・期末処理"
    ],
    external_environment: [
      "業界の急速な変化", "規制・法改正", "経済情勢の悪化", 
      "技術革新の波", "競合他社の動向", "顧客ニーズの変化"
    ]
  },

  // ③制約条件（意思決定の壁）
  constraints: {
    time_constraints: [
      "保育園送迎の時間", "介護施設通院付添い", "長時間通勤", 
      "シフト勤務固定", "夜間オンコール対応", "休日出勤の常態化"
    ],
    physical_health: [
      "体力の低下", "持病・慢性疾患", "睡眠不足の継続", 
      "通院・治療が必要", "ストレス性の不調", "過労による疲労蓄積"
    ],
    financial_constraints: [
      "住宅ローン返済", "子どもの教育費", "親の医療・介護費", 
      "歩合制・成果報酬", "収入減少リスク", "転職時の一時的収入停止"
    ],
    institutional_limits: [
      "時短勤務制度", "介護休業制度", "36協定・労働時間", 
      "ジョブ型人事制度", "副業禁止規定", "転勤・異動の制約"
    ]
  },

  // ④心理・価値観・認知（見立ての材料）
  psychology: {
    dominant_emotions: [
      "将来への不安", "現状への焦燥感", "家族への罪悪感", 
      "職場での孤立感", "過剰適応によるストレス", "自己効力感の低下"
    ],
    value_conflicts: [
      "安定追求 vs 成長挑戦", "年収向上 vs 時間確保", 
      "家族優先 vs 昇格・昇進", "専門性維持 vs 汎用スキル", 
      "個人目標 vs 組織貢献", "現在満足 vs 将来準備"
    ],
    cognitive_patterns: [
      "過度の自己責任論", "問題の過度な一般化", "白黒思考・極端化", 
      "問題回避・先延ばし", "完璧主義的傾向", "他者比較による劣等感"
    ],
    coping_styles: [
      "問題解決型アプローチ", "感情調整型対処", "社会的支援希求", 
      "回避・逃避型対処", "認知的再評価", "受容・諦観型"
    ]
  }
};

// マトリクス要素間の相関関係ルール
const MATRIX_CORRELATIONS = {
  // 年齢帯と役職・収入の相関
  age_role_correlation: {
    "20代": { likely_roles: ["SE・プログラマー", "営業", "事務・アシスタント"], income_cap: "年収500万未満" },
    "30代": { likely_roles: ["企画・マーケティング", "専門職", "管理・経営"], income_range: "年収300-700万" },
    "40代": { likely_roles: ["管理・経営", "専門職", "人事・労務"], income_range: "年収500-1000万" },
    "50代": { likely_roles: ["管理・経営", "専門職"], income_range: "年収700万以上" },
    "60代": { likely_roles: ["専門職", "業務委託"], considerations: ["定年・継続雇用"] }
  },
  
  // 業界と働き方の相関
  industry_workstyle_correlation: {
    "医療": { remote_likely: false, shift_likely: true, oncall_likely: true },
    "IT・システム": { remote_likely: true, shift_likely: false, flexible_likely: true },
    "製造": { remote_likely: false, shift_likely: true, travel_possible: true },
    "金融": { remote_ratio: "制限あり", compliance_strict: true },
    "公務": { remote_limited: true, overtime_regulated: true }
  },
  
  // 家族状況と制約の相関
  family_constraint_correlation: {
    "乳幼児育児中": { time_constraints: ["保育園送迎"], flexibility_need: "高" },
    "親の介護中": { time_constraints: ["介護施設通院付添い"], emergency_response_need: true },
    "単身赴任中": { travel_constraints: true, family_time_limited: true },
    "共働き夫婦": { coordination_need: true, dual_career_issues: true }
  }
};

// マトリクスベースでのケース生成関数
function generateMatrixBasedCase(rng, selectedTheme) {
  try {
    // ①基礎属性の生成
    const foundation = generateFoundationAttributes(rng);
    
    // ②トリガーの選択（テーマに応じて）
    const trigger = selectAppropriateTrigger(rng, selectedTheme, foundation);
    
    // ③制約条件の導出
    const constraints = deriveConstraints(rng, foundation, trigger);
    
    // ④心理・認知パターンの選択
    const psychology = selectPsychologyPattern(rng, foundation, trigger, constraints);
    
    // ⑤整合性チェック・調整
    const consistentCase = validateAndAdjustCase(rng, {
      foundation, trigger, constraints, psychology, theme: selectedTheme
    });
    
    return consistentCase;
  } catch (error) {
    console.error("マトリクス生成エラー:", error);
    // エラーの場合はnullを返して従来システムにフォールバック
    return null;
  }
}

// 基礎属性生成（相関を考慮）
function generateFoundationAttributes(rng) {
  // 年齢帯を先に決定
  const age_band = choice(rng, CASE_MATRIX.foundation.demographics.age_band);
  const gender = choice(rng, CASE_MATRIX.foundation.demographics.gender);
  
  // 年齢に応じた適切な役職・収入を選択
  const age_constraints = MATRIX_CORRELATIONS.age_role_correlation[age_band] || {};
  const role = age_constraints.likely_roles ? 
    choice(rng, age_constraints.likely_roles) : 
    choice(rng, CASE_MATRIX.foundation.work_profile.role);
  
  // 業界選択
  const industry = choice(rng, CASE_MATRIX.foundation.work_profile.industry);
  
  // 業界に応じた働き方の調整
  const industry_rules = MATRIX_CORRELATIONS.industry_workstyle_correlation[industry] || {};
  let remote_ratio, shift_type, oncall;
  
  if (industry_rules.remote_likely === false) {
    remote_ratio = choice(rng, ["完全出社", "在宅20%"]);
  } else if (industry_rules.remote_likely === true) {
    remote_ratio = choice(rng, ["在宅50%", "在宅80%", "完全リモート"]);
  } else {
    remote_ratio = choice(rng, CASE_MATRIX.foundation.work_style.remote_ratio);
  }
  
  if (industry_rules.shift_likely) {
    shift_type = choice(rng, ["シフト制", "変形労働時間"]);
  } else {
    shift_type = choice(rng, CASE_MATRIX.foundation.work_style.shift_type);
  }
  
  oncall = industry_rules.oncall_likely ? 
    choice(rng, ["夜間オンコール月2回", "休日対応あり", "24時間体制"]) :
    choice(rng, CASE_MATRIX.foundation.work_style.oncall);
  
  // その他の属性
  const employment = choice(rng, CASE_MATRIX.foundation.work_profile.employment);
  const tenure = choice(rng, CASE_MATRIX.foundation.work_profile.tenure_years);
  const family_status = choice(rng, CASE_MATRIX.foundation.family_status);
  const travel_frequency = choice(rng, CASE_MATRIX.foundation.work_style.travel_frequency);
  const overtime = choice(rng, CASE_MATRIX.foundation.quantitative_metrics.overtime_bands);
  const commute = choice(rng, CASE_MATRIX.foundation.quantitative_metrics.commute_time);
  const income = choice(rng, CASE_MATRIX.foundation.quantitative_metrics.income_ranges);
  
  return {
    age_band, gender, industry, role, employment, tenure, family_status,
    remote_ratio, shift_type, travel_frequency, oncall, overtime, commute, income
  };
}

// テーマに応じたトリガー選択
function selectAppropriateTrigger(rng, theme, foundation) {
  // テーマとトリガーのマッピング
  const theme_trigger_map = {
    "転職・キャリア転機": ["organizational", "external_environment"],
    "ワークライフバランス": ["personal_life", "timeline_pressure"],
    "職場の人間関係・役割葛藤": ["organizational"],
    "メンタル不調・適応困難": ["organizational", "personal_life"],
    "育児と仕事の両立": ["personal_life"],
    "介護と仕事の両立": ["personal_life"],
    "スキル・成長停滞": ["organizational", "external_environment"],
    "セカンドキャリア・定年後": ["timeline_pressure", "personal_life"],
    // 他のテーマも必要に応じて追加
  };
  
  const trigger_categories = theme_trigger_map[theme] || ["organizational", "personal_life"];
  const selected_category = choice(rng, trigger_categories);
  const trigger = choice(rng, CASE_MATRIX.triggers[selected_category]);
  
  return { category: selected_category, detail: trigger };
}

// 制約条件の導出
function deriveConstraints(rng, foundation, trigger) {
  const constraints = [];
  
  // 家族状況に基づく制約
  const family_rules = MATRIX_CORRELATIONS.family_constraint_correlation[foundation.family_status] || {};
  if (family_rules.time_constraints) {
    constraints.push(...family_rules.time_constraints);
  }
  
  // 働き方に基づく制約
  if (foundation.overtime === "月80時間超") {
    constraints.push(choice(rng, CASE_MATRIX.constraints.physical_health));
  }
  
  if (foundation.commute === "90分超") {
    constraints.push("長時間通勤");
  }
  
  // 追加の制約をランダム選択
  const additional_constraint_types = Object.keys(CASE_MATRIX.constraints);
  const constraint_type = choice(rng, additional_constraint_types);
  const additional_constraint = choice(rng, CASE_MATRIX.constraints[constraint_type]);
  constraints.push(additional_constraint);
  
  return [...new Set(constraints)]; // 重複除去
}

// 心理・認知パターンの選択
function selectPsychologyPattern(rng, foundation, trigger, constraints) {
  const emotion = choice(rng, CASE_MATRIX.psychology.dominant_emotions);
  const value_conflict = choice(rng, CASE_MATRIX.psychology.value_conflicts);
  const cognitive_pattern = choice(rng, CASE_MATRIX.psychology.cognitive_patterns);
  const coping_style = choice(rng, CASE_MATRIX.psychology.coping_styles);
  
  return { emotion, value_conflict, cognitive_pattern, coping_style };
}

// ケースの整合性検証・調整
function validateAndAdjustCase(rng, caseData) {
  const { foundation, trigger, constraints, psychology, theme } = caseData;
  
  // 年齢と役職・収入の整合性チェック
  const age_rules = MATRIX_CORRELATIONS.age_role_correlation[foundation.age_band];
  if (age_rules && age_rules.income_cap && 
      (foundation.income === "年収700-1000万" || foundation.income === "年収1000万超") && 
      foundation.age_band === "20代") {
    // 20代で高収入は調整
    foundation.income = choice(rng, ["年収300-500万", "年収500-700万"]);
  }
  
  // 業界と働き方の整合性チェック
  const industry_rules = MATRIX_CORRELATIONS.industry_workstyle_correlation[foundation.industry];
  if (industry_rules && industry_rules.remote_likely === false && 
      (foundation.remote_ratio === "在宅80%" || foundation.remote_ratio === "完全リモート")) {
    foundation.remote_ratio = choice(rng, ["完全出社", "在宅20%"]);
  }
  
  return { foundation, trigger, constraints, psychology, theme };
}

// ---------- テキスト生成：CCC ----------
// 従来のgenerateCCC関数（互換性のため残存）
function generateCCC(rng, meta, level="standard"){
  return generateCCCWithMatrix(rng, meta, null, level);
}

// マトリクス情報を統合したCCC生成関数
function generateCCCWithMatrix(rng, meta, matrixCase, level="standard"){
  const connect = choice(rng, PHRASES.connect);
  const modal = choice(rng, PHRASES.modals);
  const intent = choice(rng, PHRASES.intents);

  // metaオブジェクトをそのまま使用（テーマベースの選択を維持）
  const expandedMeta = {
    ...meta,
    law: choice(rng, AXES.laws),
    timeAxis: choice(rng, PHRASES.timeAxis)
  };

  // マトリクス情報を優先して活用（マトリクス情報がある場合）
  let effectiveFoundation = matrixCase ? matrixCase.foundation : null;
  
  // 相談者の基本情報
  const name = expandedMeta.gender === "男性" ? "Aさん" : expandedMeta.gender === "女性" ? "Bさん" : "Cさん";
  const genderText = expandedMeta.gender === "非回答" ? "" : `、${expandedMeta.gender}`;
  const basicFamily = expandedMeta.family || "単身";
  
  // マトリクス情報が存在する場合は詳細情報を追加
  let detailedWorkInfo = "";
  if (matrixCase && matrixCase.foundation) {
    try {
      const mc = matrixCase.foundation;
      detailedWorkInfo = `\n勤務形態：${mc.employment}、勤続年数：${mc.tenure}、${mc.remote_ratio}勤務\n業界：${mc.industry}、職種：${mc.role}`;
      
    } catch (error) {
      console.warn("マトリクス詳細情報の生成に失敗:", error);
      detailedWorkInfo = "";
    }
  }
  
  // 業界・職種に応じた略歴（修正後の年齢を使用）
  const careerYear = Math.max(expandedMeta.age - 22, 1); // 最低1年のキャリア
  const retireAge = expandedMeta.age >= 65 ? 65 : null; // 65歳以上で定年
  const currentStatus = retireAge ? "定年退職。現在は無職" : `勤務${careerYear}年`;

  // 相談者情報セクション
  const info = `相談者情報：\n${name}${genderText}、${expandedMeta.age}歳、${basicFamily}${detailedWorkInfo}`;
  
  // より詳細で多様な略歴パターン
  const companySize = choice(rng, ["大手企業", "中小企業", "ベンチャー企業", "外資系企業", "公的機関", "NPO法人", "独立系企業", "グループ企業", "上場企業"]);
  
  // 学歴パターンと社会人開始年齢の整合性を確保
  const educationPatterns = {
    "高校卒業後": { startAge: 18, description: "高校卒業後" },
    "短大卒業後": { startAge: 20, description: "短大卒業後" },
    "専門学校卒業後": { startAge: 20, description: "専門学校卒業後" },
    "大学卒業後": { startAge: 22, description: "大学卒業後" },
    "大学院修了後": { startAge: 24, description: "大学院修了後" },
    "夜間大学卒業後": { startAge: 23, description: "夜間大学卒業後" },
    "社会人経験を経て大学卒業後": { startAge: 26, description: "社会人経験を経て大学卒業後" }
  };
  
  const selectedEducation = choice(rng, Object.keys(educationPatterns));
  const educationInfo = educationPatterns[selectedEducation];
  const maxCareerYears = expandedMeta.age - educationInfo.startAge;
  
  // キャリア年数が負になったり過大になったりしないよう調整
  const adjustedCareerYear = Math.max(Math.min(maxCareerYears, expandedMeta.age - educationInfo.startAge), 1);
  
  // キャリアパターンを多様化
  const careerPatterns = [
    // 新卒一社型
    {
      pattern: "新卒入社",
      description: `${educationInfo.description}、${companySize}である${expandedMeta.industry}に新卒入社。${expandedMeta.job}として${adjustedCareerYear}年間勤務。これまで転職経験はなく、現職が初めての就職先である。`
    },
    // 転職経験型
    {
      pattern: "転職経験",
      description: `${educationInfo.description}、最初は${choice(rng, ["製造業", "サービス業", "IT業界", "金融業界", "教育業界"])}で${randInt(rng, 2, Math.max(adjustedCareerYear-2, 3))}年勤務した後、現在の${expandedMeta.industry}に転職。転職後${Math.max(adjustedCareerYear - randInt(rng, 2, Math.max(adjustedCareerYear-2, 3)), 1)}年が経過。`
    },
    // 複数転職型
    {
      pattern: "複数転職",
      description: `これまでに${randInt(rng, 2, 3)}回の転職を経験。最初は${choice(rng, ["商社", "メーカー", "小売業", "建設業", "医療機関"])}、その後${choice(rng, ["コンサルティング", "IT企業", "外資系企業", "スタートアップ"])}を経て、現在の${expandedMeta.industry}で${Math.max(adjustedCareerYear - randInt(rng, 3, 8), 1)}年勤務。`
    },
    // 異業種転職型
    {
      pattern: "異業種転職",
      description: `前職では${choice(rng, ["営業職", "事務職", "技術職", "企画職", "管理職"])}として${choice(rng, ["銀行", "保険会社", "商社", "製造業", "公務員"])}で${randInt(rng, 5, 10)}年勤務。${randInt(rng, 1, 3)}年前に異業種である現在の${expandedMeta.industry}に転職し、${expandedMeta.job}として新たなキャリアを積んでいる。`
    },
    // 専門職移行型
    {
      pattern: "専門職移行",
      description: `当初は${choice(rng, ["総合職", "一般職", "営業職"])}として入社したが、${randInt(rng, 2, Math.max(adjustedCareerYear-2, 3))}年前から${expandedMeta.job}の専門性を身につけ、現在は専門職として活動。業界経験は${adjustedCareerYear}年。`
    },
    // Uターン・地方移住型
    {
      pattern: "地方移住",
      description: `${educationInfo.description}、都市部で${choice(rng, ["大手メーカー", "商社", "IT企業", "金融機関"])}に勤務していたが、${randInt(rng, 2, Math.max(adjustedCareerYear-2, 2))}年前に地元にUターン。現在は地方の${expandedMeta.industry}で${expandedMeta.job}として働いている。`
    },
    // 起業・独立経験型
    {
      pattern: "起業経験",
      description: `新卒入社から${Math.min(randInt(rng, 3, 6), Math.max(adjustedCareerYear-3, 3))}年後に独立起業を経験。${Math.min(randInt(rng, 2, 4), Math.max(adjustedCareerYear-5, 2))}年間の経営を経て、現在は${expandedMeta.industry}の${expandedMeta.job}として組織で働いている。起業経験を活かした業務に従事。`,
      condition: () => adjustedCareerYear >= 8  // 最低8年必要（3年会社員+2年起業+3年現職）
    },
    // 海外勤務経験型
    {
      pattern: "海外経験",
      description: `入社後${Math.min(randInt(rng, 2, 4), Math.max(adjustedCareerYear-4, 2))}年目に海外駐在を経験（${choice(rng, ["アジア", "欧州", "北米", "東南アジア"])}で${Math.min(randInt(rng, 2, 3), Math.max(adjustedCareerYear-4, 2))}年）。帰国後は国際業務や海外展開に関わる${expandedMeta.job}として活動している。`,
      condition: () => adjustedCareerYear >= 7  // 最低7年必要（2年+2年駐在+3年帰国後）
    },
    // 出産・育児復帰型（性別・年齢・家族構成チェック）
    {
      pattern: "育児復帰",
      description: `${educationInfo.description}入社し、順調にキャリアを積んでいたが、出産を機に${randInt(rng, 1, 3)}年の育児休業を取得。復職後は${expandedMeta.job}として時短勤務から徐々にフルタイムに戻し、現在に至る。`,
      condition: () => expandedMeta.gender === "女性" && expandedMeta.age >= 25 && expandedMeta.family.includes('子')
    },
    // 非正規から正社員型
    {
      pattern: "正社員登用",
      description: `当初は${choice(rng, ["派遣社員", "契約社員", "パート社員"])}として${expandedMeta.industry}で勤務を開始。${randInt(rng, 2, 4)}年後に正社員登用され、現在は${expandedMeta.job}として活躍。非正規時代の経験も活かしている。`
    },
    // 業界内転職型
    {
      pattern: "業界内転職",
      description: `${expandedMeta.industry}業界一筋で、同業界内で${randInt(rng, 2, 3)}回の転職を経験。各社で${expandedMeta.job}としての専門性を磨き、業界内でのネットワークも構築。現職では${randInt(rng, 2, 6)}年勤務。`
    },
    // 公務員から民間型
    {
      pattern: "公務員転職",
      description: `${educationInfo.description}公務員として${randInt(rng, 5, Math.max(adjustedCareerYear-2, 5))}年勤務した後、民間企業への転職を決意。現在の${expandedMeta.industry}には${Math.max(adjustedCareerYear - randInt(rng, 5, Math.max(adjustedCareerYear-2, 5)), 1)}年前に転職し、${expandedMeta.job}として民間での経験を積んでいる。`
    },
    // 中途採用・第二新卒型
    {
      pattern: "第二新卒",
      description: `${educationInfo.description}、新卒で${choice(rng, ["商社", "メーカー", "IT企業", "金融機関", "小売業"])}に入社したが、${randInt(rng, 1, 3)}年で退職。第二新卒として現在の${expandedMeta.industry}に転職し、${expandedMeta.job}として${Math.max(adjustedCareerYear - randInt(rng, 1, 3), 1)}年勤務している。`,
      condition: () => adjustedCareerYear >= 2 && adjustedCareerYear <= 8
    },
    // フリーランス・業務委託経験型
    {
      pattern: "フリーランス経験",
      description: `会社員経験の後、${randInt(rng, 2, 4)}年間フリーランス・業務委託として活動。独立時代は${choice(rng, ["コンサルティング", "デザイン", "システム開発", "ライティング", "マーケティング支援"])}を手がけていたが、${randInt(rng, 1, 3)}年前に現在の${expandedMeta.industry}に正社員として復帰。`
    },
    // 資格取得・専門転換型
    {
      pattern: "資格転換",
      description: `前職では${choice(rng, ["一般事務", "営業職", "接客業", "製造職"])}に従事していたが、働きながら${choice(rng, ["簿記", "宅建", "社労士", "ITパスポート", "FP", "介護福祉士"])}などの資格を取得。資格を活かした${expandedMeta.job}として${randInt(rng, 2, 6)}年前に現職に転職。`
    },
    // 大手から中小・ベンチャー型
    {
      pattern: "規模転換",
      description: `新卒で大手${choice(rng, ["製造業", "金融機関", "商社", "インフラ企業"])}に入社し、${randInt(rng, 5, Math.max(adjustedCareerYear-3, 5))}年勤務。よりチャレンジングな環境を求めて${choice(rng, ["中小企業", "ベンチャー企業", "スタートアップ"])}である現在の${expandedMeta.industry}に転職し、${expandedMeta.job}として活動している。`
    },
    // 管理職登用・昇格型
    {
      pattern: "管理職昇格",
      description: `入社後${Math.min(randInt(rng, 5, 8), Math.max(adjustedCareerYear-3, 5))}年間は一般職として経験を積み、${Math.max(randInt(rng, 2, 4), Math.min(adjustedCareerYear-5, 4))}年前に管理職に昇格。現在は${expandedMeta.job}の立場で部下${randInt(rng, 3, 12)}名のマネジメントを担当している。`,
      condition: () => adjustedCareerYear >= 8 && (expandedMeta.job.includes('マネー') || expandedMeta.job.includes('主任') || expandedMeta.job.includes('課長') || expandedMeta.job.includes('部長') || expandedMeta.job.includes('チーフ'))
    },
    // 地方から都市部型
    {
      pattern: "都市部進出",
      description: `地方の${choice(rng, ["製造業", "農協", "地銀", "地方自治体", "医療機関"])}で${randInt(rng, 3, Math.max(adjustedCareerYear-2, 3))}年勤務した後、キャリアアップを目指して都市部に転居。現在の${expandedMeta.industry}で${expandedMeta.job}として${Math.max(adjustedCareerYear - randInt(rng, 3, Math.max(adjustedCareerYear-2, 3)), 1)}年勤務している。`
    },
    // 親の事業継承型
    {
      pattern: "事業継承",
      description: `当初は一般企業で${randInt(rng, 3, Math.max(adjustedCareerYear-5, 3))}年の会社員経験を積んだ後、家業である${expandedMeta.industry}に入社。現在は${expandedMeta.job}として事業運営に携わり、将来的な事業継承を視野に入れた準備を進めている。`,
      condition: () => adjustedCareerYear >= 8 && (expandedMeta.industry.includes('製造') || expandedMeta.industry.includes('小売') || expandedMeta.industry.includes('建設') || expandedMeta.industry.includes('サービス'))
    }
  ];
  
  // 条件に合うキャリアパターンのみを選択
  const availablePatterns = careerPatterns.filter(pattern => {
    return !pattern.condition || pattern.condition();
  });
  
  const selectedCareer = choice(rng, availablePatterns.length > 0 ? availablePatterns : careerPatterns);
  
  // 業界・職種に応じた適切な実績を選択
  const getRelevantAchievement = (industry, job) => {
    const achievementMap = {
      // 営業系職種
      "営業": ["営業成績では常に上位の実績を残した", "顧客満足度向上に大きく貢献した", "新規開拓で社内表彰を受賞した"],
      "商社営業": ["営業成績では常に上位の実績を残した", "新規取引先開拓に成功した", "年間売上目標を連続達成した"],
      
      // 技術・専門職系
      "SE": ["システム開発プロジェクトを成功に導いた", "技術的課題解決で社内表彰を受賞した", "新技術導入に積極的に取り組んだ"],
      "システム開発": ["大規模システム開発に携わった", "プロジェクトマネジメントで成果を上げた", "技術革新プロジェクトを主導した"],
      "診療放射線技師": ["医療技術向上に貢献した", "医療機器の専門知識を活かした", "患者ケア向上に取り組んだ"],
      "Webエンジニア": ["Webサービス開発で成果を上げた", "ユーザビリティ改善を主導した", "新技術習得に積極的に取り組んだ"],
      
      // 管理・運営系
      "物流センター運営": ["物流効率化で大幅なコスト削減を実現した", "在庫管理システム改善を主導した", "配送品質向上に貢献した"],
      "倉庫運営": ["倉庫運営効率化を推進した", "安全管理体制の構築に貢献した", "作業プロセス改善を実現した"],
      "人事": ["人材育成プログラムを構築した", "採用業務で優秀な人材確保に貢献した", "労務管理の効率化を推進した"],
      "企画": ["新規事業の立ち上げに参画した", "マーケティング戦略立案で成果を上げた", "業務改善プロジェクトを主導した"],
      
      // 医療系
      "看護職": ["患者ケアの質向上に貢献した", "医療安全管理に積極的に取り組んだ", "チーム医療の調整役として活躍した"],
      
      // デフォルト（汎用）
      "default": ["業務改善に積極的に取り組んだ", "チームワークを活かして成果を上げた", "専門知識の習得に努めた", "後輩指導に定評があった"]
    };
    
    return choice(rng, achievementMap[job] || achievementMap["default"]);
  };
  
  // 業界・職種に応じた適切な役職を選択（年齢・キャリア年数考慮）
  const getRelevantRole = (industry, job, employment, age, careerYears) => {
    // 年齢・キャリア年数に応じた役職レベル制限
    const canBeManager = age >= 30 && careerYears >= 5;
    const canBeSeniorManager = age >= 35 && careerYears >= 8;
    
    const roleMap = {
      // 管理職系（年齢・経験チェック）
      "プレイングマネージャー": canBeManager ? "プレイングマネージャーとして" : "チームの中核メンバーとして",
      "中間管理職": canBeSeniorManager ? "課長職として" : canBeManager ? "主任として" : "実務担当者として",
      "チームリーダー": canBeManager ? "チームリーダーとして" : "チームメンバーとして",
      "主任・係長級": careerYears >= 3 ? "主任として" : "実務担当者として",
      
      // 専門職系
      "診療放射線技師": "診療放射線技師として",
      "看護職": "看護師として", 
      "SE": careerYears >= 5 ? "システムエンジニアとして" : "プログラマーとして",
      "PM": canBeManager ? "プロジェクトマネージャーとして" : "システムエンジニアとして",
      
      // 一般職系
      "正社員": careerYears >= 5 ? 
        choice(rng, ["現場の第一線で", "チームの中核メンバーとして", "実務担当者として"]) :
        choice(rng, ["実務担当者として", "現場スタッフとして"]),
      "default": "現場で"
    };
    
    return roleMap[employment] || roleMap[job] || roleMap["default"];
  };
  
  // 業界に応じた勤務形態の調整
  const getConsistentWorkStyle = (industry, workStyle) => {
    const industryWorkStyleMap = {
      "医療": {
        "在宅50%": "病院勤務・一部テレワーク対応",
        "完全出社": "病院勤務",
        "シフト制": "シフト制",
        "夜間オンコール月4回": "夜間オンコール対応あり"
      },
      "IT": {
        "在宅50%": "在宅50%",
        "在宅10%": "在宅10%",
        "完全出社": "完全出社",
        "毎日残業40時間ペース": "毎日残業40時間ペース"
      },
      "物流": {
        "シフト制": "シフト制",
        "遅番・土曜勤務増加": "遅番・土曜勤務増加",
        "21時上がりシフト": "21時上がりシフト",
        "夜間トラブル対応あり": "夜間トラブル対応あり"
      },
      "default": workStyle
    };
    
    const industryMap = industryWorkStyleMap[industry] || industryWorkStyleMap["default"];
    return industryMap[workStyle] || workStyle;
  };
  
  const achievement = getRelevantAchievement(expandedMeta.industry, expandedMeta.job);
  const currentRole = getRelevantRole(expandedMeta.industry, expandedMeta.job, expandedMeta.employment, expandedMeta.age, careerYear);
  const consistentWorkStyle = getConsistentWorkStyle(expandedMeta.industry, expandedMeta.workStyle);
  
  const history = `略歴：${selectedCareer.description}${achievement}。${currentRole}${expandedMeta.employment}の立場で${consistentWorkStyle}の勤務形態で働いている。`;
  
  // 家族構成をより詳しく
  const familyDetail = expandedMeta.family.includes('子') ? 
    choice(rng, ["子育てと仕事の両立に日々奮闘している", "子どもの成長に合わせて働き方を調整している", "家族の時間を大切にしながらも仕事への責任感を持っている"]) :
    choice(rng, ["夫婦でお互いの仕事を支え合っている", "家族との時間と仕事のバランスを重視している", "将来の家族計画も視野に入れている"]);
  
  const family = `家族構成：${expandedMeta.family}。${familyDetail}`;
  
  const date = `面接日時：2025年7月初旬　本人の希望で来談（初回面談）`;
  
  // テーマに基づいた具体的な相談概要
  const getThemeOverview = (theme, mainComplaint) => {
    const themeOverviewMap = {
      "転職・キャリア転機": `現在の職場でのキャリア発展に限界を感じ、転職を検討している。${mainComplaint}状況について、今後の方向性を相談したい。`,
      "ワークライフバランス": `仕事と私生活のバランスが取れず、${mainComplaint}。働き方の見直しや今後の対応策について相談したい。`,
      "職場の人間関係・役割葛藤": `職場での人間関係や役割に関して${mainComplaint}。この状況への対処法について相談したい。`,
      "メンタル不調・適応困難": `最近、${mainComplaint}状況が続いている。このままでは良くないと感じ、対応策について相談したい。`,
      "育児と仕事の両立": `子育てと仕事の両立で${mainComplaint}。今後の働き方について相談したい。`,
      "介護と仕事の両立": `親の介護と仕事の両立で${mainComplaint}。今後の対応について相談したい。`,
      "スキル・成長停滞": `仕事でのスキル向上や成長に関して${mainComplaint}。キャリア発展について相談したい。`,
      "セカンドキャリア・定年後": `定年後の生活設計について${mainComplaint}。今後の方向性について相談したい。`
    };
    
    return themeOverviewMap[theme] || `${mainComplaint}状況について、今後の対応策を相談したい。`;
  };
  
  const overview = `相談の概要：【略Ａ】`;

  // 相談者の話した内容（逐語録風）
  const dialogue = generateDialogue(rng, expandedMeta, matrixCase);

  // セクション組み立て
  const sections = [info, history, family, date, overview, dialogue];
  
  return sections.join("\n\n");
}

function generateDialogue(rng, expandedMeta, matrixCase) {
  // 具体的なエピソード
  const specificEpisode = choice(rng, [
    `先日、同僚との会話の中で「最近どう？」と聞かれた時に、思わず「実は...」と言いかけて止まってしまった`,
    `週末に家族と過ごしている時も、つい仕事のことが頭をよぎってしまい、集中できない状態が続いている`,
    `朝起きた時に「今日も一日頑張ろう」という気持ちが以前ほど湧いてこなくなった自分に気づいた`,
    `通勤電車の中で、ふと「このままでいいのかな」と考え込んでしまうことが増えた`
  ]);

  // より詳細な現状説明
  const currentSituation = [
    `現在は${expandedMeta.workStyle}で働いており、${expandedMeta.employment}として${randInt(rng, 35, 55)}時間/週の勤務をしている`,
    `${expandedMeta.trigger}があってから、特に職場での立ち位置や今後の方向性について考えることが多くなった`,
    `${expandedMeta.constraint}という制約がある中で、どこまで自分の希望を優先できるのか悩んでいる`,
    `家族は${expandedMeta.family}で、${choice(rng, ["家族の理解は得られている", "家族にはまだ相談できていない", "家族も心配してくれている"])}状況だ`
  ];

  // 心境の変化
  const emotionalChange = [
    `以前は仕事に対して${choice(rng, ["やりがい", "充実感", "達成感", "使命感"])}を感じていたが、最近は${choice(rng, AXES.psych)}という気持ちが強くなっている`,
    `特に${expandedMeta.timeAxis}から、${choice(rng, ["自分の価値観", "働き方", "人生の優先順位", "キャリアの方向性"])}について見つめ直すようになった`,
    `同世代の友人や同僚の話を聞いていると、みんなそれぞれに悩みながらも前進している様子で、自分だけが立ち止まっているような感覚になることがある`
  ];

  const support = [
    `幸い${choice(rng, AXES.supports)}があり、相談できる環境はある`,
    `${choice(rng, AXES.supports)}にも話を聞いてもらったが、まだ整理がついていない`,
    `一人で考えても答えが出ないので、専門的な視点からのアドバイスが欲しいと思った`,
    `家族や職場の人には心配をかけたくないという思いもあり、第三者に相談することにした`
  ];

  const future = [
    `どうしたらいいのかわからない状況が続いている`,
    `何が良いのか自分ではわからず、迷いが深まるばかりである`,
    `どうすれば良いか悩んでいる日々が続いている`,
    `自分一人では答えが見つからず、どう進んでいけばよいか判断に迷っている`
  ];
  
  const ccResponses = [
    "もう少し詳しくお聞かせください",
    "どの点で特にお困りでしょうか", 
    "ご自身としてはどのように感じておられますか",
    "その時のお気持ちはいかがでしたか",
    "どのような変化があったのでしょうか"
  ];

  const underlineBResponses = [
    `${expandedMeta.theme}について悩んでおられるのですね`,
    `${expandedMeta.valueConflict}でお気持ちが揺れているということでしょうか`,
    `${expandedMeta.mainComplaint}ということでしょうか`,
    `なぜそのように思われるのでしょうか`,
    `それに対してどのようにお感じになりますか`,
    `その状況をどのように受け止めておられますか`,
    `今のお気持ちを聞かせていただけますか`,
    `そう思われる背景には何があるのでしょうか`
  ];

  // マトリクスベースの心理描写を事前に生成
  const psychologyText = matrixCase && matrixCase.psychology ? 
    generateMatrixBasedPsychology(rng, matrixCase) : 
    "このままの状態が続くのも良くないと分かっているが、一歩を踏み出すための具体的な方法が見えない状況だ。";

  // 具体的で詳細な逐語録を構成
  const dialogue = `相談者の話した内容：

「${specificEpisode}。${choice(rng, currentSituation)}。

${choice(rng, emotionalChange)}。正直に言うと、仕事に対する情熱が以前ほど感じられなくなっていて、毎日が何となく過ぎている感じがする。

（${choice(rng, ccResponses)}）

実は、${expandedMeta.valueConflict}という気持ちがあって、どちらを優先すべきなのか迷ってしまう。${choice(rng, currentSituation)}という状況もあり、簡単には決められない複雑さがある。

${choice(rng, emotionalChange)}。周りを見回すと、同僚や友人はそれぞれ自分の道を歩んでいるように見えて、自分だけが迷っているような気持ちになることがある。

${choice(rng, support)}。でも、具体的にどう相談したらいいのか、何から整理したらいいのかが分からない状態だ。

（${choice(rng, underlineBResponses)}）【下線Ｂ】

そうだな。${expandedMeta.constraint}という制約もある中で、${choice(rng, ["理想を追求すべきなのか", "現実を受け入れるべきなのか", "新しい道を模索すべきなのか", "今の状況を改善すべきなのか"])}、本当に迷っている。

${psychologyText}

どうすれば良いのかわからない…。」`;

  return dialogue;
}

// マトリクスの心理情報に基づく具体的な内面描写
function generateMatrixBasedPsychology(rng, matrixCase) {
  if (!matrixCase || !matrixCase.psychology) {
    return "このままの状態が続くのも良くないと分かっているが、一歩を踏み出すための具体的な方法が見えない状況だ。";
  }
  
  const { emotion, value_conflict, cognitive_pattern, coping_style } = matrixCase.psychology;
  
  // 感情状態に基づく表現
  const emotionExpressions = {
    "将来への不安": [
      "この先どうなるのか、先行きが見えない不安が大きくて",
      "将来のことを考えると夜も眠れなくなることがある",
      "漠然とした将来への心配がいつも頭の片隅にある"
    ],
    "現状への焦燥感": [
      "時間ばかりが過ぎていく気がして、焦りを感じている",
      "このままではいけないと分かっているのに、なかなか動けない",
      "周りはどんどん前に進んでいるのに、自分だけ取り残されている感覚"
    ],
    "家族への罪悪感": [
      "家族に負担をかけてしまっているのが心苦しい",
      "家庭のことを犠牲にしてまでやるべきなのか悩んでいる",
      "家族の時間を削ってしまうことへの申し訳なさがある"
    ],
    "職場での孤立感": [
      "職場で相談できる人がいないのがつらい",
      "周りとの温度差を感じることが多くなった",
      "一人で抱え込んでしまいがちで、それが良くないと思っている"
    ],
    "過剰適応によるストレス": [
      "周りに合わせすぎて、自分の本音が分からなくなってきた",
      "いい顔をしすぎて疲れてしまっている",
      "本当はもっと素直に意見を言いたいのだが、つい遠慮してしまう"
    ],
    "自己効力感の低下": [
      "自分にはもう能力がないのではないかと思えてきた",
      "何をやってもうまくいかない気がしている",
      "以前のような自信が持てなくなってしまった"
    ]
  };
  
  // 価値観の葛藤に基づく表現
  const conflictExpressions = {
    "安定追求 vs 成長挑戦": "安定を取るべきか、リスクを取ってでも成長を目指すべきか",
    "年収向上 vs 時間確保": "収入を優先するか、時間的なゆとりを重視するか",
    "家族優先 vs 昇格・昇進": "家族との時間を大切にするか、キャリアアップを目指すか",
    "専門性維持 vs 汎用スキル": "専門分野を極めるか、幅広いスキルを身につけるか",
    "個人目標 vs 組織貢献": "自分の目標を追うか、組織への貢献を重視するか",
    "現在満足 vs 将来準備": "今の満足を大切にするか、将来への準備を優先するか"
  };
  
  // 認知パターンに基づく思考の特徴
  const cognitiveExpressions = {
    "過度の自己責任論": "全て自分の責任だと思ってしまい、一人で解決しなければと考えてしまう",
    "問題の過度な一般化": "一つのことがうまくいかないと、全てがダメなような気になってしまう",
    "白黒思考・極端化": "うまくいくか完全に失敗するかの二択で考えがちで、中間がない",
    "問題回避・先延ばし": "難しい判断を避けて、なんとなく時間が過ぎるのを待っている状態",
    "完璧主義的傾向": "中途半端なことはしたくないが、完璧を求めすぎて動けないでいる",
    "他者比較による劣等感": "他の人と比べてしまい、自分が劣っているように感じている"
  };
  
  const emotionText = choice(rng, emotionExpressions[emotion] || ["気持ちの整理がつかない状況が続いている"]);
  const conflictText = conflictExpressions[value_conflict] || "優先順位をつけるのが難しい";
  const cognitiveText = cognitiveExpressions[cognitive_pattern] || "考え方を整理したい";
  
  return `${emotionText}。特に${conflictText}という点で悩んでいる。${cognitiveText}ところがある`;
}


// ---------- テキスト生成：JCDA ----------
function generateJCDA(rng, meta, level="standard"){
  // 逐語 I と II の差分（決めつけ vs 内省促進 など）を意図的に作り分け
  const turnA = [
    "CL：最近、仕事が手につかなくて…評価のことばかり考えてしまいます。",
    "CC：評価のことが頭を占めて、集中が難しいのですね。"
  ];
  const turnB = [
    "CL：上司が替わってから、何を見られているのか分からなくて。",
    "CC：上司が替わり、基準が不明瞭に感じているのですね。"
  ];

  const I = [
    ...turnA,
    "CL：はい…とりあえず数をこなせば評価は上がるかなと。",
    "CC（I）：数を増やすのが大事なんですね。（決めつけ）"
  ].join("\n");

  const II = [
    ...turnA,
    "CL：はい…とりあえず数をこなせば評価は上がるかなと。",
    "CC（II）：数を増やすことにどんな意味を見ていますか？（内省促進）"
  ].join("\n");

  const diff = `【I/IIの違い（指定語句）】\nIは「決めつけ」、IIは「内省促進」に該当。IIでは${choice(rng, ["受容","焦点化","感情の言語化"])}を意図している。`;
  const valid = `【妥当性判断と理由】\nCLの価値観探索を促すIIが相応しい。根拠は、${meta.trigger}により基準が不明瞭で、${meta.valueConflict}の整理が課題${choice(rng, PHRASES.modals)}。`;
  const problem = `【CLの問題点】\n${meta.mainComplaint}。事実（${meta.workStyle}・残業${meta.overtime}h/月・${meta.constraint}）と感情（${choice(rng, AXES.psych)}）が混線。`;
  const next = `【以降の展開】\n意図は${choice(rng, PHRASES.intents)}。質問例：「評価が上がる状態を具体的に言うと？」「それは何を満たすと言えそう？」。期待効果：意思決定の基準が言語化され、短期目標に接続できる。`;

  const preface = `（逐語 I）\n${I}\n\n（逐語 II）\n${II}`;
  const sections = level==="compact" ? [diff, next] :
                   level==="detailed" ? [diff, valid, problem, next] :
                   [diff, valid, problem, next];

  return preface + "\n\n" + sections.join("\n\n");
}

// ---------- 生成パイプライン ----------
function generateCase(input){
  const seedBase = `${input.mode}|${input.gender}|${input.age}|${input.family}|${input.theme}|${input.industry}|${input.job}|${input.seed||Date.now()}`;
  let rng = createRNG(seedBase);

  // 再サンプルを数回試行して重複を避ける
  const ATTEMPTS = 12;
  let lastMeta = null, chosen = null, chosenSig = null, text = "";

  for (let t=0; t<ATTEMPTS; t++){
    const meta = sampleMeta(rng, input);
    if (!coherent(meta)) { continue; }

    // 直近と4軸以上異なるか（履歴があれば直前で判定）
    if (historySignatures.length > 0){
      const prev = historySignatures[0];
      const prevMetaKeys = Array.isArray(prev) ? prev : [];
      // 粗い比較：前回のメタのキー値を取れないのでスキップ（Jaccardで担保）
    }

    const sig = tokensFromCase(meta);
    const nov = noveltyScore(sig, historySignatures.map(arr => new Set(arr)));

    // 最低新規性しきい値（粒度で変える）
    const threshold = input.level === "detailed" ? 0.45 : input.level === "compact" ? 0.30 : 0.35;
    if (nov < threshold){
      // 新規性が足りない→希少軸を強制注入してみる（1回だけ）
      if (!lastMeta){
        meta.trigger = "事業部の統廃合";
        meta.family = "ひとり親・子1（9）";
      } else {
        continue;
      }
    }

    // テキスト化（マトリクスベースの情報も統合）
    let matrixCase = null;
    try {
      matrixCase = generateMatrixBasedCase(rng, input.theme);
    } catch (error) {
      console.warn("マトリクス生成に失敗、従来システムを使用:", error);
    }
    text = (input.mode === "CCC") ? generateCCCWithMatrix(rng, meta, matrixCase, input.level) : generateJCDA(rng, meta, input.level);
    chosen = meta; chosenSig = sig;
    break;
  }

  if (!chosen){ // 最後の砦：しきい値無視で一度通す
    const meta = sampleMeta(rng, input);
    const sig = tokensFromCase(meta);
    let matrixCase = null;
    try {
      matrixCase = generateMatrixBasedCase(rng, input.theme);
    } catch (error) {
      console.warn("マトリクス生成に失敗、従来システムを使用:", error);
    }
    text = (input.mode === "CCC") ? generateCCCWithMatrix(rng, meta, matrixCase, input.level) : generateJCDA(rng, meta, input.level);
    chosen = meta; chosenSig = sig;
  }

  // 履歴更新
  if (chosen && chosenSig){
    const usedTokens = Array.from(chosenSig);
    updateHistory(chosenSig, usedTokens);
  }

  return text;
}

// ---------- UI配線 ----------
const $ = sel => document.querySelector(sel);

// PDF保存機能のハンドラー関数（グローバル）
window.handlePdfExport = function() {
  console.log("=== handlePdfExport関数が呼び出されました ===");
  const previewEl = document.getElementById("preview");
  console.log("previewEl要素:", previewEl);
  
  // 解答内容を収集
  const answers = [
    { 
      id: "answer1", 
      title: "設問１", 
      question: "事例記録の中の「相談の概要」【略Ａ】の記載に相当する、相談者がこの面談で相談したいことは何か。事例記録を手掛かりに記述せよ。（10点）",
      guideline: "目安: 75〜90文字",
      lines: "answer-2-lines"
    },
    { 
      id: "answer2", 
      title: "設問２", 
      question: "事例記録の【下線Ｂ】について、この事例を担当したキャリアコンサルタントがどのような意図で応答したと考えるかを記述せよ。（10点）",
      guideline: "目安: 75〜90文字",
      lines: "answer-2-lines"
    },
    { 
      id: "answer3a", 
      title: "設問３-①", 
      question: "あなたが考える相談者の問題を記述してください。（10点）",
      guideline: "目安: 65〜75文字",
      lines: "answer-2-lines"
    },
    { 
      id: "answer3b", 
      title: "設問３-②", 
      question: "上記問題の根拠を相談者の言動を通じて、具体的に記述してください。（10点）",
      guideline: "目安: 115〜130文字",
      lines: "answer-3-lines"
    },
    { 
      id: "answer4", 
      title: "設問４", 
      question: "設問３で答えた内容を踏まえ、今後あなたがこのケースを担当するとしたら、どのような方針でキャリアコンサルティングを進めていくか記述せよ。（10点）",
      guideline: "目安: 240〜270文字",
      lines: "answer-6-lines"
    }
  ];

  let hasAnswers = false;
  let pdfContent = `<p><strong>作成日時:</strong> ${new Date().toLocaleString("ja-JP")}</p>`;
  
  // 事例記録を必ず含める
  if (previewEl.textContent && previewEl.textContent !== "ここに事例記録が表示されます。") {
    pdfContent += `<h2>事例記録</h2><div class="case-record">${previewEl.textContent.replace(/\n/g, '<br>')}</div>`;
  } else {
    pdfContent += `<h2>事例記録</h2><div class="answer-text">事例記録が生成されていません。まず「生成する」ボタンで事例記録を作成してください。</div>`;
  }

  pdfContent += `<h2>解答内容</h2>`;

  answers.forEach(answer => {
    const textarea = document.getElementById(answer.id);
    const answerText = textarea ? textarea.value.trim() : "";
    
    if (answerText) hasAnswers = true;

    // 改行を保持してHTMLに変換
    const formattedAnswerText = answerText ? answerText.replace(/\n/g, '<br>') : "(未記入)";

    pdfContent += `
      <div class="answer-section">
        <h3>${answer.title}</h3>
        <p class="question-text">${answer.question}</p>
        <div class="answer-text">${formattedAnswerText}</div>
      </div>
    `;
  });

  // 事例記録の存在チェック
  const hasRecord = previewEl.textContent && previewEl.textContent !== "ここに事例記録が表示されます。";
  
  if (!hasRecord && !hasAnswers) {
    alert("事例記録が生成されておらず、解答も入力されていません。\n\n1. まず「生成する」ボタンで事例記録を作成\n2. 設問に回答を入力\n3. PDF保存してください");
    return;
  }
  
  if (!hasRecord) {
    const proceed = confirm("事例記録が生成されていませんが、解答のみでPDFを作成しますか？\n\n推奨：先に「生成する」ボタンで事例記録を作成することをお勧めします。");
    if (!proceed) return;
  }
  
  if (!hasAnswers) {
    const proceed = confirm("解答が入力されていませんが、事例記録のみでPDFを作成しますか？");
    if (!proceed) return;
  }

  // PDF用コンテンツを設定
  document.getElementById("pdfAnswers").innerHTML = pdfContent;
  
  // 印刷用クラスを追加
  document.body.classList.add("pdf-export");
  
  // 印刷ダイアログを開く
  window.print();
  
  // 印刷後にクラスを削除
  setTimeout(() => {
    document.body.classList.remove("pdf-export");
  }, 1000);
};

// グローバルなテーマ切り替え関数（HTML onclick属性から呼び出し）
let globalCurrentTheme = "dark"; // デフォルトをdarkに設定

// 共有機能（グローバル関数）
function shareToX() {
  console.log("Xで共有ボタンがクリックされました");
  
  const currentURL = window.location.href;
  const shareText = "【キャリコン論述】事例記録を作ろう！ - キャリアコンサルティング協議会用";
  
  console.log("Current URL:", currentURL);
  
  // X(Twitter)共有URL
  const twitterText = encodeURIComponent(shareText);
  const twitterUrl = encodeURIComponent(currentURL);
  const twitterURL = `https://twitter.com/intent/tweet?text=${twitterText}&url=${twitterUrl}`;
  
  console.log("Twitter URL:", twitterURL);
  window.open(twitterURL, "_blank");
}

function shareToLINE() {
  console.log("LINEで共有ボタンがクリックされました");
  
  const currentURL = window.location.href;
  const shareText = "【キャリコン論述】事例記録を作ろう！ - キャリアコンサルティング協議会用";
  
  console.log("Current URL:", currentURL);
  
  // LINE共有URL
  const lineURL = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(currentURL)}&text=${encodeURIComponent(shareText)}`;
  
  console.log("LINE URL:", lineURL);
  window.open(lineURL, "_blank");
}

// 緊急テスト用：全設問の文字カウント機能
function testSimpleCharCount() {
  console.log("=== 全設問緊急テスト開始 ===");
  console.log("現在時刻:", new Date().toLocaleTimeString());
  console.log("document.readyState:", document.readyState);
  
  // 全設問のIDリスト
  const questions = [
    { textareaId: 'answer1', counterId: 'count1' },
    { textareaId: 'answer2', counterId: 'count2' },
    { textareaId: 'answer3a', counterId: 'count3a' },
    { textareaId: 'answer3b', counterId: 'count3b' },
    { textareaId: 'answer4', counterId: 'count4' }
  ];
  
  questions.forEach(({ textareaId, counterId }) => {
    console.log(`\n=== ${textareaId}の処理開始 ===`);
    
    const textarea = document.getElementById(textareaId);
    const counter = document.getElementById(counterId);
    
    console.log(`${textareaId}:`, textarea);
    console.log(`${counterId}:`, counter);
    
    if (textarea && counter) {
      console.log(`${textareaId}: 要素が見つかりました。イベントリスナーを追加します。`);
      
      // 既存のイベントリスナーを削除するため要素を複製・置換
      const newTextarea = textarea.cloneNode(true);
      textarea.parentNode.replaceChild(newTextarea, textarea);
      
      // 新しい要素に対してイベントリスナーを追加
      newTextarea.addEventListener('input', function() {
        const text = newTextarea.value;
        const count = text.replace(/\n/g, '').length; // 改行を除いた文字数
        counter.textContent = count;
        console.log(`${textareaId}: 文字数更新: ${count}, 値: "${text}"`);
        
        // localStorage保存は無効化（リロード時に文字が残らないようにするため）
        // localStorage.setItem("answer_" + textareaId, text);
      });
      
      // keyupイベントも追加（確実性のため）
      newTextarea.addEventListener('keyup', function() {
        const text = newTextarea.value;
        const count = text.replace(/\n/g, '').length;
        counter.textContent = count;
      });
      
      // pasteイベントも追加
      newTextarea.addEventListener('paste', function() {
        setTimeout(() => {
          const text = newTextarea.value;
          const count = text.replace(/\n/g, '').length;
          counter.textContent = count;
        }, 10);
      });
      
      // 初期値設定（リロード時は常に空にする）
      newTextarea.value = "";
      counter.textContent = "0";
      console.log(`${textareaId}: 初期値を空に設定`);
      
      // 視覚的確認用の緑色背景を削除
      // counter.style.background = "lightgreen";
      // counter.style.padding = "2px 4px";
      // counter.style.borderRadius = "3px";
      
      console.log(`${textareaId}: イベントリスナー追加完了`);
    } else {
      console.error(`${textareaId}: 要素が見つかりませんでした`);
      console.error(`${textareaId}が存在しない:`, !textarea);
      console.error(`${counterId}が存在しない:`, !counter);
    }
  });
  
  console.log("=== 全設問処理完了 ===");
}

function toggleTheme() {
  console.log("toggleTheme関数が呼び出されました");
  const newTheme = globalCurrentTheme === "dark" ? "light" : "dark";
  
  // テーマ適用
  document.documentElement.setAttribute('data-theme', newTheme);
  document.body.setAttribute('data-theme', newTheme);
  
  // アイコン変更
  const toggle = $("#themeToggle");
  const icon = toggle?.querySelector('.theme-icon path');
  if (icon) {
    if (newTheme === "dark") {
      icon.setAttribute('d', 'M12 7a5 5 0 100 10 5 5 0 000-10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42');
    } else {
      icon.setAttribute('d', 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z');
    }
  }
  
  globalCurrentTheme = newTheme;
  // ローカルストレージに保存
  try {
    localStorage.setItem("rondoku_theme", newTheme);
  } catch (e) {
    console.warn("ローカルストレージへの保存に失敗:", e);
  }
}

// DOMが読み込まれてから初期化
document.addEventListener('DOMContentLoaded', () => {
  // 削除された要素の参照をコメントアウト
  // const modeEl = $("#mode");
  // const genderEl = $("#gender");
  // const ageEl = $("#age");
  // const familyEl = $("#family");
  // const industryEl = $("#industry");
  // const jobEl = $("#job");
  const themeEl = $("#theme");
  const previewEl = $("#preview");
  const manualRecordEl = $("#manualRecord");
  const toggleEditEl = $("#toggleEdit");
  const clearRecordEl = $("#clearRecord");
  
  let isEditMode = false;

  // 編集モード切り替え
  toggleEditEl.addEventListener("click", () => {
    isEditMode = !isEditMode;
    const outputCard = document.querySelector('.output-card');
    
    if (isEditMode) {
      // 編集モードに切り替え
      outputCard.classList.add('edit-mode');
      toggleEditEl.textContent = "表示モード";
      toggleEditEl.classList.add('active');
      
      // 現在のpreview内容をtextareaにコピー
      if (previewEl.textContent !== "ここに事例記録が表示されます。") {
        manualRecordEl.value = previewEl.textContent;
      }
      manualRecordEl.focus();
    } else {
      // 表示モードに戻る
      outputCard.classList.remove('edit-mode');
      toggleEditEl.textContent = "手動編集モード";
      toggleEditEl.classList.remove('active');
      
      // textareaの内容をpreviewに反映
      if (manualRecordEl.value.trim()) {
        previewEl.textContent = manualRecordEl.value;
      }
    }
  });

  // クリア機能
  clearRecordEl.addEventListener("click", () => {
    const confirmed = confirm("事例記録をクリアしますか？");
    if (confirmed) {
      previewEl.textContent = "ここに事例記録が表示されます。";
      manualRecordEl.value = "";
    }
  });

  // 手動編集中のリアルタイム反映
  manualRecordEl.addEventListener("input", () => {
    if (isEditMode && manualRecordEl.value.trim()) {
      previewEl.textContent = manualRecordEl.value;
    }
  });

  // 45文字制限の解答欄での自動改行処理
  function handle45CharLimit(textarea) {
    textarea.addEventListener("input", (e) => {
      const lines = e.target.value.split('\n');
      let modified = false;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 45) {
          // 45文字で改行を挿入
          const line = lines[i];
          lines[i] = line.substring(0, 45);
          lines.splice(i + 1, 0, line.substring(45));
          modified = true;
        }
      }
      
      // 2行制限
      if (lines.length > 2) {
        lines.length = 2;
        modified = true;
      }
      
      if (modified) {
        const newValue = lines.join('\n');
        e.target.value = newValue;
        
        // カーソル位置を調整
        const pos = Math.min(e.target.selectionStart, newValue.length);
        e.target.setSelectionRange(pos, pos);
      }
    });
  }

  // 設問3-1専用: 1行目41文字、2行目45文字制限
  function handle3_1CharLimit(textarea) {
    textarea.addEventListener("input", (e) => {
      const lines = e.target.value.split('\n');
      let modified = false;
      
      for (let i = 0; i < lines.length; i++) {
        const maxChars = i === 0 ? 41 : 45; // 1行目は41文字、2行目は45文字
        if (lines[i].length > maxChars) {
          const line = lines[i];
          lines[i] = line.substring(0, maxChars);
          lines.splice(i + 1, 0, line.substring(maxChars));
          modified = true;
        }
      }
      
      // 2行制限
      if (lines.length > 2) {
        lines.length = 2;
        modified = true;
      }
      
      if (modified) {
        const newValue = lines.join('\n');
        e.target.value = newValue;
        
        // カーソル位置を調整
        const pos = Math.min(e.target.selectionStart, newValue.length);
        e.target.setSelectionRange(pos, pos);
      }
    });
  }

  // 設問1・2・3-1用: 43文字制限関数
  function handle43CharLimit(textarea) {
    textarea.addEventListener("input", (e) => {
      const lines = e.target.value.split('\n');
      let modified = false;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 43) {
          // 43文字で改行を挿入
          const line = lines[i];
          lines[i] = line.substring(0, 43);
          lines.splice(i + 1, 0, line.substring(43));
          modified = true;
        }
      }
      
      // 2行制限
      if (lines.length > 2) {
        lines.length = 2;
        modified = true;
      }
      
      if (modified) {
        const newValue = lines.join('\n');
        e.target.value = newValue;
        
        // カーソル位置を調整
        const pos = Math.min(e.target.selectionStart, newValue.length);
        e.target.setSelectionRange(pos, pos);
      }
    });
  }
  
  // 41文字制限関数（設問3-1用：2行）
  function handle41CharLimit2Lines(textarea) {
    textarea.addEventListener("input", (e) => {
      const lines = e.target.value.split('\n');
      let modified = false;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 41) {
          // 41文字で改行を挿入
          const line = lines[i];
          lines[i] = line.substring(0, 41);
          lines.splice(i + 1, 0, line.substring(41));
          modified = true;
        }
      }
      
      // 2行制限
      if (lines.length > 2) {
        lines.length = 2;
        modified = true;
      }
      
      if (modified) {
        const newValue = lines.join('\n');
        e.target.value = newValue;
        
        // カーソル位置を調整
        const pos = Math.min(e.target.selectionStart, newValue.length);
        e.target.setSelectionRange(pos, pos);
      }
    });
  }

  // 41文字制限関数（設問3-2用：3行）
  function handle41CharLimit3Lines(textarea) {
    textarea.addEventListener("input", (e) => {
      const lines = e.target.value.split('\n');
      let modified = false;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 41) {
          // 41文字で改行を挿入
          const line = lines[i];
          lines[i] = line.substring(0, 41);
          lines.splice(i + 1, 0, line.substring(41));
          modified = true;
        }
      }
      
      // 3行制限
      if (lines.length > 3) {
        lines.length = 3;
        modified = true;
      }
      
      if (modified) {
        const newValue = lines.join('\n');
        e.target.value = newValue;
        
        // カーソル位置を調整
        const pos = Math.min(e.target.selectionStart, newValue.length);
        e.target.setSelectionRange(pos, pos);
      }
    });
  }


  // 43文字制限関数（設問4用：6行）
  function handle43CharLimit6Lines(textarea) {
    textarea.addEventListener("input", (e) => {
      const lines = e.target.value.split('\n');
      let modified = false;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 43) {
          // 43文字で改行を挿入
          const line = lines[i];
          lines[i] = line.substring(0, 43);
          lines.splice(i + 1, 0, line.substring(43));
          modified = true;
        }
      }
      
      // 6行制限
      if (lines.length > 6) {
        lines.length = 6;
        modified = true;
      }
      
      if (modified) {
        const newValue = lines.join('\n');
        e.target.value = newValue;
        
        // カーソル位置を調整
        const pos = Math.min(e.target.selectionStart, newValue.length);
        e.target.setSelectionRange(pos, pos);
      }
    });
  }


  $("#gen").addEventListener("click", () => {
    try {
      console.log("生成ボタンがクリックされました");
      
      // テーマ要素の存在確認
      if (!themeEl) {
        alert("テーマ選択要素が見つかりません。");
        return;
      }

      // テーマが未選択の場合はエラー
      if (!themeEl.value) {
        alert("テーマを選択してください。");
        themeEl.focus();
        return;
      }

      console.log("選択されたテーマ:", themeEl.value);

      const seed = Math.random().toString(36).substring(2);
      const rng = createRNG(seed);
      
      console.log("themeEl:", themeEl);
      console.log("themeEl.value:", themeEl ? themeEl.value : "themeEl is null");
      
      const input = {
        mode: "CCC", // CCCに固定
        gender: choice(rng, ["男性", "女性", "非回答"]), // ランダム選択
        age: Math.floor(rng() * (75 - 18 + 1)) + 18, // 18-75歳でランダム
        family: choice(rng, AXES.family), // ランダム選択
        theme: themeEl ? themeEl.value : "",
        industry: choice(rng, AXES.industries), // ランダム選択
        job: choice(rng, AXES.jobs), // ランダム選択
        level: "standard",
        seed: seed
      };
      
      console.log("入力データ:", input);
      
      const text = generateCase(input);
      console.log("生成されたテキスト:", text);
      
      previewEl.textContent = text;
      
      // 編集モードの場合は表示モードに戻す
      if (isEditMode) {
        const outputCard = document.querySelector('.output-card');
        outputCard.classList.remove('edit-mode');
        toggleEditEl.textContent = "手動編集モード";
        toggleEditEl.classList.remove('active');
        isEditMode = false;
      }
      
      console.log("プレビューに設定完了");
      
    } catch (error) {
      console.error("生成中にエラーが発生しました:", error);
      alert("エラーが発生しました: " + error.message);
    }
  });

  $("#regen").addEventListener("click", () => {
    // 別パターン生成
    $("#gen").click();
  });

  $("#download").addEventListener("click", () => {
    const blob = new Blob([previewEl.textContent], {type:"text/markdown;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rondoku_CCC_${Date.now()}.md`; // CCCに固定
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // PDF保存機能は別の場所で初期化されます

  $("#exportHistory")?.addEventListener("click", () => {
    const data = {
      historySignatures,
      freqMap
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rondoku_history_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $("#clearHistory")?.addEventListener("click", () => {
    if (confirm("履歴と頻度情報をクリアしますか？")){
      historySignatures = [];
      freqMap = {};
      saveStorage(HISTORY_KEY, historySignatures);
      saveStorage(FREQ_KEY, freqMap);
      alert("クリアしました");
    }
  });

  // テーマ切替
  const THEME_KEY = "rondoku_theme";
  let currentTheme = loadStorage(THEME_KEY, "dark"); // デフォルトをdarkに設定
  globalCurrentTheme = currentTheme;  // グローバル変数も同期

  function applyTheme(theme) {
    console.log("applyTheme関数が呼ばれました。テーマ:", theme);
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    const toggle = $("#themeToggle");
    const icon = toggle?.querySelector('.theme-icon path');
    console.log("toggle要素:", toggle, "icon要素:", icon);
    
    if (icon) {
      if (theme === "dark") {
        // ダークモード時は太陽アイコン（ライトモードへの切り替え用）
        icon.setAttribute('d', 'M12 7a5 5 0 100 10 5 5 0 000-10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42');
      } else {
        // ライトモード時は月アイコン（ダークモードへの切り替え用）
        icon.setAttribute('d', 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z');
      }
    }
    
    currentTheme = theme;
    saveStorage(THEME_KEY, theme);
  }

  const themeToggleBtn = $("#themeToggle");
  if (themeToggleBtn) {
    // addEventListener方式
    themeToggleBtn.addEventListener("click", () => {
      console.log("テーマ切り替えボタンがクリックされました。現在のテーマ:", currentTheme);
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      console.log("新しいテーマ:", newTheme);
      applyTheme(newTheme);
    });
    
    // onclick方式も併用（フォールバック）
    themeToggleBtn.onclick = (e) => {
      e.preventDefault();
      console.log("onclick経由でテーマ切り替え");
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      applyTheme(newTheme);
    };
  } else {
    console.warn("themeToggleボタンが見つかりません");
  }

  // 初期テーマ適用
  applyTheme(currentTheme);
  
  // 追加でテーマボタンの再確認（DOM完全読み込み後）
  setTimeout(() => {
    const themeBtn = $("#themeToggle");
    console.log("setTimeout後のテーマボタンチェック:", themeBtn);
    if (themeBtn && !themeBtn.onclick) {
      console.log("イベントリスナーを再度追加します");
      themeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("タイムアウト後のクリックイベント発火");
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        applyTheme(newTheme);
      });
    }
  }, 100);

  // 設問機能の初期化（DOM完全読み込み後）
  setTimeout(() => {
    console.log("設問機能初期化をタイムアウト後に実行");
    // 緊急テスト版を実行
    testSimpleCharCount();
    
    // PDF保存ボタンの初期化はHTML onclick属性で処理
  
    
    // initializeQuestions(); // 一時的に無効化
  }, 200);
});

// window.load イベントでも試してみる
window.addEventListener('load', () => {
  console.log("=== window.load イベント発生 ===");
  setTimeout(() => {
    console.log("window.load後のテスト実行");
    testSimpleCharCount();
  }, 500);
});

// 設問機能
function initializeQuestions() {
  console.log("=== initializeQuestions開始 ===");
  
  // 最もシンプルな実装で確実に動作させる
  setupCharacterCount('answer1', 'count1');
  setupCharacterCount('answer2', 'count2');
  setupCharacterCount('answer3a', 'count3a');
  setupCharacterCount('answer3b', 'count3b');
  setupCharacterCount('answer4', 'count4');
  
  
  // 文字制限機能を少し後で適用
  setTimeout(() => {
    console.log("文字制限機能を適用中...");
    initializeCharacterLimits();
  }, 300);
}

// 文字制限機能の初期化
function initializeCharacterLimits() {
  try {
    handle43CharLimit(document.getElementById('answer1'));
    handle43CharLimit(document.getElementById('answer2'));
    handle41CharLimit2Lines(document.getElementById('answer3a'));
    handle41CharLimit3Lines(document.getElementById('answer3b'));
    handle43CharLimit6Lines(document.getElementById('answer4'));
    console.log("文字制限機能の適用完了");
  } catch (error) {
    console.warn("文字制限機能の適用でエラー:", error);
  }
}

// 各解答欄の文字数カウント設定（個別関数）
function setupCharacterCount(textareaId, counterId) {
  console.log(`=== ${textareaId}の文字数カウント設定開始 ===`);
  
  const textarea = document.getElementById(textareaId);
  const counter = document.getElementById(counterId);
  
  console.log(`textarea(${textareaId}):`, textarea);
  console.log(`counter(${counterId}):`, counter);
  
  if (!textarea) {
    console.error(`テキストエリア ${textareaId} が見つかりません`);
    return;
  }
  
  if (!counter) {
    console.error(`カウンター ${counterId} が見つかりません`);
    return;
  }
  
  // 文字数更新関数
  function updateCharCount() {
    const text = textarea.value;
    const count = text.replace(/\n/g, '').length;
    counter.textContent = count;
    console.log(`${textareaId}: "${text}" -> 文字数: ${count}`);
    
    // ローカルストレージ保存は無効化
    // localStorage.setItem("answer_" + textareaId, text);
  }
  
  // イベントリスナー登録
  console.log(`${textareaId}にイベントリスナー登録中...`);
  textarea.addEventListener('input', updateCharCount);
  textarea.addEventListener('keyup', updateCharCount);
  textarea.addEventListener('paste', (e) => {
    setTimeout(updateCharCount, 10); // paste後の値を取得するため少し待つ
  });
  
  // 初期値設定（リロード時は常に空にする）
  textarea.value = "";
  console.log(`${textareaId}の初期値を空に設定`);
  
  // 初期文字数設定
  updateCharCount();
  console.log(`=== ${textareaId}の設定完了 ===`);
}

