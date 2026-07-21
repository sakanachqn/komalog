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
    desc: "同じ種類のユニットを盤面に2体以上配置すると、その種類の最大HP・攻撃力 +40%",
  },
  {
    id: "legionPact",
    name: "千軍の契約",
    icon: "📜",
    desc: "配置上限が2倍になる代わりに、味方全員の最大HP・攻撃力・防御が50%になる",
  },
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
    desc: "狂戦士の最大HP +15%、吸血 +25%",
  },
  {
    id: "ninefoldHarmony",
    name: "九重の調和",
    icon: "☯️",
    desc: "発動中のシナジー段階の合計1につき、味方全員の最大HP・攻撃力 +6%（最大36%）",
  },
  {
    id: "shadowCrown",
    name: "影王の冠",
    icon: "🌑",
    desc: "暗殺者のクリティカルダメージが160%から230%になる",
  },
  { id: "starEaterScale", name: "星喰らいの天秤", icon: "⚖️", desc: "★1の最大HP・攻撃力・呪文威力+45%、★2は+20%。★3には効果なし" },
  { id: "lastSupper", name: "最後の晩餐", icon: "🍽️", desc: "配置上限より2体以上少ない場合、不足1枠につき配置中の味方の最大HP・攻撃力+15%" },
  { id: "hundredMask", name: "百貌の仮面", icon: "🎭", desc: "盤面上で1体しかいないユニット種類は、所持シナジーのカウントがそれぞれ+1" },
  { id: "chaosKaleidoscope", name: "混沌の万華鏡", icon: "🔶", desc: "戦闘ごとに味方全員へランダムな戦闘役割の強力な祝福を1つ与える" },
  { id: "warGodArm", name: "武神の左腕", icon: "💪", desc: "アイテム未装備ユニットの攻撃力・呪文威力+35%、攻撃速度+20%" },
  { id: "treasureAltar", name: "宝物王の祭壇", icon: "🏺", desc: "アイテム装備中の味方が倒れると、生存中の味方1体がその遺志を受け継いで強化される" },
  { id: "primeCrucible", name: "原初の坩堝", icon: "🏭", desc: "合成アイテム装備者の最大HP・攻撃力・呪文威力+25%。通常アイテム装備者は-20%" },
  { id: "reverseHourglass", name: "逆巻く砂時計", icon: "⌛", desc: "戦闘開始5秒後、生存中の味方のHP・位置・マナを戦闘開始時へ一度だけ戻す" },
  { id: "twilightBell", name: "黄昏の鐘", icon: "🔔", desc: "味方が3体倒れた瞬間、残った味方のマナを最大にし、戦闘終了まで攻撃速度+50%" },
  { id: "lifeBeacon", name: "命の灯台", icon: "🗼", desc: "各味方は戦闘中1回、HP30%未満で最大HP20%のシールドを得て後方へ退避する" },
  { id: "binaryStarCore", name: "連星の核", icon: "🌟", desc: "初期配置で同じ縦列・横列に味方がいるユニットは攻撃力・呪文威力+20%。3体以上の列ならマナ獲得+25%" },
  { id: "emptyThrone", name: "空白の玉座", icon: "🪑", desc: "盤面中央4マスを空けて開始すると、味方全員の射程+1、与ダメージ+25%" },
  { id: "soulMirror", name: "魂写しの鏡", icon: "🪞", desc: "戦闘開始時、最低コストの味方1体が最高コストの味方のスキルを70%威力でコピー" },
  { id: "dragonHeart", name: "竜脈の心臓", icon: "🐲", desc: "味方がスキルを合計6回発動するたび、敵全体へ最大HP5%ダメージ、味方全体を最大HP5%回復" },
  { id: "doomsdayContract", name: "終末の契約書", icon: "📕", desc: "味方はHP70%で開始する代わりに、クリ率+30%、クリダメ+50%、吸血+15%" },
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
