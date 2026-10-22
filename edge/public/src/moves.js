export const CHARACTERS = {
  yiyi: {
    id: "yiyi",
    name: "一二",
    species: "白色熊猫",
    role: "速度 · 连招",
    title: "奶泡小旋风",
    tagline: "靠脚步和拳速把对手卷进连招。",
    bio: "系着黑领结的白色小熊，比赛时像一颗会转弯的奶泡。她血量不算最高，但移动、起手和连击速度都很出色，擅长用突进缩短距离，再用短拳与回旋连续施压。",
    guideNote: "适合喜欢快速接近、连续按键和贴近压制的玩家。",
    stats: { speed: 94, power: 68, defense: 72, combo: 96 },
    color: "#ffb6c4",
    accent: "#ce4358",
    maxHp: 96,
    speed: 3.55,
    jump: 6.1,
    weight: 0.82,
    light: {
      name: "奶泡三连拳",
      description: "快速挥出三段连续拳，每一段都能增加少量心动值。第三拳推力最大，适合起手和确认连击。",
      tactic: "贴身后连点，抓住对手没有防御的瞬间。",
      duration: 0.34,
      hits: [
        { time: 0.1, damage: 3, push: 0.55, heart: 7, hitstop: 0.035 },
        { time: 0.19, damage: 3, push: 0.55, heart: 7, hitstop: 0.035 },
        { time: 0.28, damage: 4, push: 1.15, heart: 9, hitstop: 0.045 }
      ],
      range: 1.45,
      height: 1.7,
      kind: "light"
    },
    heavy: {
      name: "团子飞拳",
      description: "蓄力后挥出带冲击波的重拳，伤害和击退都比普通连拳高，可以把对手推开重新拉开节奏。",
      tactic: "用来终结连招，或在角落把对手打回场中。",
      duration: 0.56,
      hits: [{ time: 0.24, damage: 11, push: 2.35, heart: 14, hitstop: 0.075, launch: 1.8 }],
      range: 1.72,
      height: 1.95,
      kind: "heavy"
    },
    special: {
      name: "团子突进",
      description: "向前高速冲刺并撞向对手，带残影、碎晶和横向冲击效果。命中距离远，是追人和快速抢攻的核心技能。",
      tactic: "对手后撤或距离拉开时使用，落地后接轻拳最稳定。",
      duration: 0.66,
      hits: [{ time: 0.28, damage: 13, push: 2.8, heart: 17, hitstop: 0.085 }],
      range: 1.85,
      height: 1.8,
      kind: "dash",
      cooldown: 1.7,
      dash: 5.5
    },
    special2: {
      name: "领结回旋",
      description: "借用领结旋转身体，连续两段横扫。命中范围比普通拳更宽，可以覆盖头顶和前后两侧。",
      tactic: "对手贴得太近时反打，也可在轻拳后用回旋收尾。",
      duration: 0.7,
      hits: [
        { time: 0.2, damage: 6, push: 0.8, heart: 14, hitstop: 0.04 },
        { time: 0.36, damage: 8, push: 2.1, heart: 14, hitstop: 0.06 }
      ],
      range: 1.75,
      height: 2.25,
      kind: "spin",
      cooldown: 2.2
    },
    throw: {
      name: "软糖背摔",
      description: "抓准近身机会把对手甩向身后，不能被普通防御挡住，并附带高击飞和大幅心动值。",
      tactic: "站在贴身距离时使用，尤其适合惩罚一直防御的对手。",
      duration: 0.8,
      hits: [{ time: 0.38, damage: 15, push: 3.6, heart: 22, hitstop: 0.1, launch: 2.6 }],
      range: 1.18,
      height: 2.0,
      kind: "throw",
      cooldown: 0.8
    },
    super: {
      name: "棉花糖风暴",
      description: "心动槽满后释放的连续风暴拳。多段攻击会在短时间内快速累积伤害，最后一击把对手高高击飞。",
      tactic: "先贴近再释放；对方只剩少量元气时可直接完成终结。",
      duration: 2.05,
      hits: [
        { time: 0.48, damage: 5, push: 0.35, heart: 0, hitstop: 0.035 },
        { time: 0.65, damage: 5, push: 0.35, heart: 0, hitstop: 0.035 },
        { time: 0.82, damage: 5, push: 0.35, heart: 0, hitstop: 0.035 },
        { time: 0.99, damage: 5, push: 0.35, heart: 0, hitstop: 0.035 },
        { time: 1.32, damage: 10, push: 4.2, heart: 0, hitstop: 0.14, launch: 5.1 }
      ],
      range: 2.2,
      height: 2.5,
      kind: "super"
    }
  },
  bubu: {
    id: "bubu",
    name: "布布",
    species: "奶茶棕小熊",
    role: "重量 · 投技",
    title: "抱抱重力场",
    tagline: "走得不快，但每一次贴身都很有分量。",
    bio: "圆滚滚的奶茶棕色小熊，温柔外表下藏着整个拳台最实在的体重。布布的移动速度较慢，却拥有更高的元气、更强的单次伤害和无可替代的近身投技，擅长把对手挤进角落再一击定音。",
    guideNote: "适合喜欢防守反击、投技和重击控制的玩家。",
    stats: { speed: 58, power: 93, defense: 91, combo: 62 },
    color: "#f5c783",
    accent: "#956048",
    maxHp: 112,
    speed: 2.62,
    jump: 5.2,
    weight: 1.3,
    light: {
      name: "软糖拍拍",
      description: "朴实但范围不错的一记熊掌拍击，出手比布布的其他招式更快，用来打断对手或试探距离。",
      tactic: "不要忙着追人，等对手靠近后用它争取出手节奏。",
      duration: 0.48,
      hits: [{ time: 0.22, damage: 7, push: 1.0, heart: 10, hitstop: 0.05 }],
      range: 1.62,
      height: 1.9,
      kind: "light"
    },
    heavy: {
      name: "奶茶肚撞",
      description: "用肚皮向前重重撞击，伤害、击退和霸气的震动效果都很突出，适合把对手推离角落。",
      tactic: "对手正在蓄力或从空中落下时迎上去使用。",
      duration: 0.68,
      hits: [{ time: 0.3, damage: 14, push: 3.05, heart: 17, hitstop: 0.09, launch: 0.8 }],
      range: 1.85,
      height: 2.0,
      kind: "heavy"
    },
    special: {
      name: "震地跺脚",
      description: "抬起身体猛踩地面，产生两段地面冲击。第一段使对手失衡，第二段会再次震动并把对手弹起。",
      tactic: "对手在地面近身时使用，双段命中能快速拉开心动值。",
      duration: 0.88,
      hits: [
        { time: 0.46, damage: 9, push: 2.2, heart: 17, hitstop: 0.06, launch: 1.6 },
        { time: 0.56, damage: 6, push: 3.4, heart: 13, hitstop: 0.07, launch: 3.3 }
      ],
      range: 2.35,
      height: 0.95,
      kind: "slam",
      cooldown: 2.0
    },
    special2: {
      name: "滚圆压顶",
      description: "缩成一团高高跃起，再用整个身体砸向地面。命中后附带强震、碎晶和大范围冲击波。",
      tactic: "预判对手会靠近时先起跳，落点尽量压在对手身上。",
      duration: 0.92,
      hits: [{ time: 0.58, damage: 16, push: 2.8, heart: 19, hitstop: 0.11, launch: 2.4 }],
      range: 1.9,
      height: 1.7,
      kind: "bodySlam",
      cooldown: 2.35
    },
    throw: {
      name: "熊抱摔",
      description: "张开双臂抱住对手并完成强力摔投，无法被普通防御挡住。伤害和击飞都很高，是布布最可靠的近身终结手段。",
      tactic: "看准贴身机会使用；不要隔着距离空放。",
      duration: 0.9,
      hits: [{ time: 0.42, damage: 18, push: 3.7, heart: 24, hitstop: 0.12, launch: 2.9 }],
      range: 1.2,
      height: 2.0,
      kind: "throw",
      cooldown: 0.9
    },
    super: {
      name: "超大号抱抱坠击",
      description: "心动槽满后先进行一次压制抱击，再跃起发动超大号坠击。最终落地会造成极高伤害、巨震和全屏冲击特效。",
      tactic: "把对手堵在角落附近释放，最终一击更容易命中。",
      duration: 2.28,
      hits: [
        { time: 0.55, damage: 4, push: 0.2, heart: 0, hitstop: 0.04 },
        { time: 1.13, damage: 8, push: 0.5, heart: 0, hitstop: 0.06, launch: 4.8 },
        { time: 1.52, damage: 20, push: 4.6, heart: 0, hitstop: 0.16, launch: 4.6 }
      ],
      range: 2.45,
      height: 2.6,
      kind: "super"
    }
  }
};

export const KEY_MAPS = {
  p1: {
    left: ["KeyA"],
    right: ["KeyD"],
    jump: ["KeyW"],
    block: ["KeyS"],
    light: ["KeyJ"],
    heavy: ["KeyK"],
    special: ["KeyL"],
    special2: ["KeyO"],
    throw: ["KeyU"],
    super: ["KeyI"]
  },
  p2: {
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
    jump: ["ArrowUp"],
    block: ["ArrowDown"],
    light: ["Digit1"],
    heavy: ["Digit2"],
    special: ["Digit3"],
    special2: ["Digit4"],
    throw: ["Digit5"],
    super: ["Digit6"]
  }
};
