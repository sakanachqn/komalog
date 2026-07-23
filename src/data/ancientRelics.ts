export interface AncientRelicDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
}

/** 幕ボス撃破時だけ入手できる、通常レリックとは別枠の強力な遺物。 */
export const ANCIENT_RELICS: AncientRelicDef[] = [
  {
    id: "twinCrown",
    name: "双頭の王冠",
    icon: "👥",
    desc: "同じ種類のユニットを盤面に2体以上配置すると、その種類の最大HP・攻撃力 +40%。★3ユニット完成時、同じ種類の★2をベンチに1体複製する。獲得前からいる★3も対象",
  },
  {
    id: "legionPact",
    name: "千軍の契約",
    icon: "📜",
    desc: "配置上限が2倍になる代わりに、味方全員の最大HP・攻撃力が60%、防御が75%になる",
  },
  {
    id: "ninefoldHarmony",
    name: "九重の調和",
    icon: "☯️",
    desc: "発動中のシナジー段階の合計1につき、味方全員の最大HP・攻撃力 +6%（最大36%）",
  },
  { id: "starEaterScale", name: "星喰らいの天秤", icon: "⚖️", desc: "★1の最大HP・攻撃力・呪文威力+45%、★2は+20%。★3には効果なし" },
  { id: "lastSupper", name: "最後の晩餐", icon: "🍽️", desc: "配置上限より2体以上少ない場合、不足1枠につき配置中の味方の最大HP・攻撃力+15%" },
  { id: "hundredMask", name: "百貌の仮面", icon: "🎭", desc: "盤面上で1体しかいないユニット種類は、所持シナジーのカウントがそれぞれ+1" },
  {
    id: "chaosKaleidoscope",
    name: "混沌の万華鏡",
    icon: "🔶",
    desc: "戦闘ごとに味方全員へ次の祝福から1つを付与する。攻撃力+30%／防御力+30／呪文威力+45／攻撃速度+30%／クリティカル率+25%かつマナ獲得+25%",
  },
  { id: "warGodArm", name: "武神の左腕", icon: "💪", desc: "アイテム未装備ユニットの攻撃力・呪文威力+35%、攻撃速度+20%" },
  { id: "treasureAltar", name: "宝物王の祭壇", icon: "🏺", desc: "アイテム装備中の味方が倒れると、生存中の味方1体がその遺志を受け継いで強化される" },
  { id: "primeCrucible", name: "原初の坩堝", icon: "🏭", desc: "合成アイテム装備者の最大HP・攻撃力・呪文威力+25%。通常アイテム装備者は-20%" },
  { id: "reverseHourglass", name: "逆巻く砂時計", icon: "⌛", desc: "戦闘開始5秒後、生存中の味方のHP・マナを開始時以上まで回復し、初期位置へ戻す" },
  { id: "twilightBell", name: "黄昏の鐘", icon: "🔔", desc: "味方が3体倒れた瞬間、残った味方のマナを最大にし、戦闘終了まで攻撃速度+50%" },
  { id: "lifeBeacon", name: "命の灯台", icon: "🗼", desc: "各味方は戦闘中1回、HP30%未満で状態異常を解除し、最大HP35%のシールドとマナ20を得て後方へ退避する" },
  { id: "binaryStarCore", name: "連星の核", icon: "🌟", desc: "初期配置で同じ縦列・横列に味方がいるユニットは攻撃力・呪文威力+20%。3体以上の列ならマナ獲得+25%" },
  { id: "emptyThrone", name: "空白の玉座", icon: "🪑", desc: "盤面中央4マスを空けて開始すると、味方全員の射程+1、与ダメージ+25%" },
  { id: "soulMirror", name: "魂写しの鏡", icon: "🪞", desc: "戦闘開始時、最低コストの味方1体が最高コストの味方のスキルを90%威力でコピーし、マナ+30" },
  { id: "dragonHeart", name: "竜脈の心臓", icon: "🐲", desc: "味方がスキルを合計6回発動するたび、敵全体へ最大HP5%ダメージ、味方全体を最大HP5%回復" },
  { id: "doomsdayContract", name: "終末の契約書", icon: "📕", desc: "味方はHP70%で開始する代わりに、クリ率+30%、クリダメ+50%、吸血+15%" },
  { id: "warriorWarBanner", name: "征服王の軍旗", icon: "🚩", desc: "戦士の攻撃力+25%、防御力+30" },
  {
    id: "aegisCore",
    name: "不滅炉心",
    icon: "🔥",
    desc: "守護者はシールドを持っている間、攻撃力 +50%",
  },
  {
    id: "manaCycle",
    name: "魔力の輪廻",
    icon: "♾️",
    desc: "魔導士はスキル発動後、最大マナの35%を即座に取り戻す",
  },
  {
    id: "skyEye",
    name: "天眼の弓",
    icon: "👁️",
    desc: "射手の射程 +1、攻撃速度 +35%",
  },
  {
    id: "bloodGrail",
    name: "血神の杯",
    icon: "🍷",
    desc: "狂戦士の最大HP +25%、攻撃速度 +20%、吸血 +30%",
  },
  {
    id: "shadowCrown",
    name: "影王の冠",
    icon: "🌑",
    desc: "暗殺者のクリティカルダメージが160%から230%になる",
  },
  { id: "priestCenser", name: "聖者の香炉", icon: "🕯️", desc: "僧侶の呪文威力+50、必要マナ-20%。僧侶シナジーの全体回復量+50%" },
  { id: "undeadSeal", name: "冥王の契印", icon: "🦴", desc: "死霊の攻撃力+20%。敵撃破による攻撃力上昇量がさらに50%増える" },
  { id: "spiritDew", name: "世界樹の朝露", icon: "💧", desc: "精霊は開始マナ+35、マナ獲得量がさらに+35%" },
  { id: "resonanceChalice", name: "残響の聖杯", icon: "🎶", desc: "共鳴者の追撃威力+20ポイント。共鳴者の呪文威力+25" },
  { id: "clockworkMainspring", name: "永劫の主ゼンマイ", icon: "🕰️", desc: "時計仕掛けの時止めが1秒延長。停止中の与ダメージが50%から80%になる" },
  { id: "parasiteBrood", name: "万蟲の母核", icon: "🪺", desc: "寄生ダメージ+50%、死亡時の伝染回数+1。寄生虫の最大HP+20%" },
  { id: "gravityLens", name: "事象の地平鏡", icon: "🔭", desc: "重力による引き寄せ間隔-1秒。重力使いの呪文威力+40、防御力+20" },
  { id: "alchemyStone", name: "真理の賢者石", icon: "🧪", desc: "錬金術師のポーション生成数+1、所持上限+1。ポーション効果が強化される" },
  { id: "gamblerGoldenCoin", name: "黄金の裏面", icon: "🪙", desc: "賭博師のコイントスが裏でもスキル封印されず、代わりに味方全員がマナ25を得る" },
  { id: "ghostLantern", name: "常夜の魂灯", icon: "🏮", desc: "亡霊の霊体時間+3秒。霊体中の与ダメージによるHP吸収が20%から35%になる" },
  { id: "doppelPrism", name: "千面の水晶", icon: "🔷", desc: "ドッペルゲンガーのコピースキル威力+30ポイント、開始マナ+30" },
  { id: "commanderBaton", name: "覇王の指揮杖", icon: "🪄", desc: "指揮官の命令対象が、最大HPの低い味方2体になる" },
  { id: "bloodMoonHeart", name: "血月の心臓", icon: "🫀", desc: "血盟で共有する合計ダメージ-25%。被弾時の全員のマナ獲得+2" },
  { id: "constellationAtlas", name: "天球の星図", icon: "🗺️", desc: "星座ライン上の味方は開始マナ+25、攻撃力・呪文威力+15%" },
  { id: "dismantlerFurnace", name: "神喰らいの溶鉱炉", icon: "♨️", desc: "1戦のスクラップ獲得上限+3。永続最大HP強化に必要なスクラップが5から4になる" },
  { id: "jesterCarnival", name: "終わらない謝肉祭", icon: "🎪", desc: "道化師は戦闘開始時に攻撃無効化を追加で2回得る。ボス戦の分身にも加算" },
];

export const ANCIENT_RELIC_BY_ID = new Map(ANCIENT_RELICS.map((r) => [r.id, r]));

export function rollAncientRelicChoices(owned: string[], n = 3): AncientRelicDef[] {
  const pool = ANCIENT_RELICS.filter((r) => !owned.includes(r.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
