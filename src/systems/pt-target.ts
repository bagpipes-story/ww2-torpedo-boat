// 米PT の隊の標的スロットの世界側（v0.6.4。jp_01「夜の輸送護衛」。docs/02 §6.4、spec §C.2〜C.6・§E.2）: 自艇と味方の大発の船体（PtHull）の配列を出撃時に 1 回作り、
// 毎ステップ valid と発見距離を書いて core/pt-target（pickPtTarget → applyPtTarget）で PtCheck の標的を差し替える。掃射の着弾（hull）を自艇の被害か輸送隊の命中へ分け、
// 自艇だけの成績（被弾・自艇への攻撃のうち撃った／無傷・最後の攻撃の標的への命中）と HUD 用の標的の種類（0 自艇・1 大発）を持つ。隊の KPI（q.hits など）はどの船体への命中も数える（core。模擬と同じ）。
// 大発が沈んだ・上陸した同じステップで valid（標的なら targetValid も）を落とす＝残りの弾が沈み始めた大発に当たらない（模擬 core/convoy-sim と同じ）。
// Phaser を import しない（tests から読む）。§7: 確保は constructor だけ。乱数は引かない（大発への命中は HP だけ）。PtSquadron が輸送隊のある任務でだけ作る（jp_05 は作らない＝core は v0.6.3 の枝）。
// v0.6.4 レビューの直し: 夜明けで切れた攻撃も閉じる（onLeave。ai:R1）、大発への航過は core が航過に数えたものだけ（ai:R2）、
// 標的が沈んだ・上陸した・輪に入ったための切り替えで受け継いだ接触が切れたのは「見失わせた」から引く（inheritedLosses。ai:R4。core と模擬は変えない）。
// v0.6.6 の準備: 船体の並びは [0] 自艇・[1..nb] 大発（nb は大発の数。隼艇を末尾 nb+1 に足せるように「[1..] はみな大発」と読まない）。着弾の振り分けは hullHit（PtSquadron.onImpact から移した）。
// HUD（ux-2・ux-5・ux-7）: 3 行目の「発見された！」は自艇が見られているときだけ（playerSeen）、狙われている大発の印（aimedBarge）、撃つ前に 25mm で黙った大発への航過（lastPassSilenced）。
import type { BoatState } from '../core/boat-motion';
import { CV_SAILING, type ConvoyParams, type ConvoyState } from '../core/convoy';
import { PT_FATE_NONE, ptFighting, type PtCheck, type PtHull, type PtSection } from '../core/pt-boats';
import { applyPtTarget, createPtTargetSet, pickPtTarget, type PtTargetRule, type PtTargetSet } from '../core/pt-target';

/** 標的スロットが読む輸送隊（systems/convoy の Convoy がそのまま満たす）: 隊の状態・寸法、米PT の標的の規則、大発が見つかる距離 m、命中（沈んだら true） */
export interface PtTargetConvoy {
  readonly state: ConvoyState;
  readonly p: ConvoyParams;
  readonly rule: PtTargetRule;
  readonly detectM: number;
  hit(i: number, damage: number, nowS: number): boolean;
}

export class PtTargets {
  /** [0] は自艇、[1..nb] は大発（core の PtCheck.targets がこの配列を読む） */
  readonly hulls: PtHull[];
  /** 大発の数（hulls の [1..nb]） */
  readonly nb: number;
  readonly set: PtTargetSet;
  readonly rule: PtTargetRule;
  /**
   * 自艇への命中・大発への命中（隊の全命中は core の q.hits）、大発を狙った航過のうち core が航過に数えたもの（撃ったか open_fire_s 経った。Result の「航過 N 回（大発へ M）」の M。
   * 連射は大発に起きない）、最初に捉えた標的（0 自艇・1 大発）
   */
  playerHits = 0;
  bargeHits = 0;
  attacksOnBarges = 0;
  firstDetectKind = 0;
  /** 自艇への攻撃（航過＋連射）のうち撃ったもの・自艇に 1 発も当たらなかったもの（Result の「かわした N/M」。大発への航過は分母に入らない） */
  firedPassesOnPlayer = 0;
  cleanPassesOnPlayer = 0;
  /** 最後に終えた攻撃の標的の船体への命中（後から落ちた弾も。HUD の「被弾 N 発」「大発 被弾 N 発」）とその標的（0 自艇・1 大発） */
  lastAttackTargetHits = 0;
  lastPassTargetKind = 0;
  /** 最後に終えた攻撃は撃たずに終わり、その PT は 25mm で黙っていた（撃退・撃沈。大発への航過の結果「大発を守った！」） */
  lastPassSilenced = false;
  /** 今の攻撃（固めた瞬間の標的）の種類と標的の船体への命中（終わる瞬間に撃っていた攻撃を Result が数えるため） */
  attackKind = 0;
  attackHits = 0;
  /** 25mm を最後に撃った体感秒（閃光の記憶 ptHeldFlashM の元。撃っていなければ −Infinity） */
  lastFireS = -Infinity;
  private attackHull = 0;
  /** 標的が valid でなくなったための切り替えで受け継いだ接触が、どの PT にも見られないまま切れた回数（core の q.lostContacts から引く。Result の「見失わせた」） */
  inheritedLosses = 0;
  /**
   * 今の攻撃の PT と、攻撃が開いている（固めてから終わるまで。core が onPassEnd 無しで閉じる攻撃: 25mm で沈んだ PT（dropOwner）は PtSquadron の onFate が dropAttack で、
   * 夜明け（pt-boats の夜明けの latch）は onLeave で閉じる）
   */
  private attackOwner = -1;
  private attackOpen = false;
  /** 固めたときの core の q.passes（終わりで増えていれば core が航過に数えた） */
  private passesAtCommit = 0;
  private lastHull = 0;
  private lastFired = false;
  private contacted = false;
  /** 今の接触は標的が valid でなくなった切り替えで受け継いだもので、まだどの PT も新しい標的を見ていない */
  private inherited = false;
  /** apply が受けた閃光の記憶 m（playerSeen の自艇の見つかる距離に） */
  private heldFlashM = 0;

  constructor(
    player: BoatState,
    playerHalfLengthM: number,
    playerHalfBeamM: number,
    private readonly convoy: PtTargetConvoy,
    /** 米PT の隊（core が航過に数えたか・夜明けで切れた攻撃が撃ったか・見たかを読む。書かない） */
    private readonly section: PtSection,
  ) {
    this.rule = convoy.rule;
    this.hulls = [{ boat: player, halfLengthM: playerHalfLengthM, halfBeamM: playerHalfBeamM, valid: true }];
    for (const b of convoy.state.barges) this.hulls.push({ boat: b, halfLengthM: convoy.p.halfLengthM, halfBeamM: convoy.p.halfBeamM, valid: b.phase === CV_SAILING });
    this.nb = convoy.state.barges.length;
    this.set = createPtTargetSet(this.hulls);
    for (let k = 1; k <= this.nb; k++) this.set.detectM[k] = convoy.detectM;
  }

  /** 今の標的の種類（0 自艇・1 大発（1..nb）・2 は末尾の船体（v0.6.6 の隼艇）。HUD の文の分岐） */
  get targetKind(): number {
    const k = this.set.current;
    return k === 0 ? 0 : k <= this.nb ? 1 : 2;
  }

  /** 自艇が的になれる（浮いていて輪の外。25mm の canFire もこれ） */
  get playerValid(): boolean {
    return this.hulls[0]!.valid;
  }

  /** 毎ステップの始め（25mm の前）: 自艇の帯の発見距離と有効、大発の有効（航行中だけ。上陸・沈没は的でなくなる） */
  begin(playerDetectM: number, playerValid: boolean): void {
    this.set.detectM[0] = playerDetectM;
    this.hulls[0]!.valid = playerValid;
    const barges = this.convoy.state.barges;
    for (let k = 1; k <= this.nb; k++) this.hulls[k]!.valid = barges[k - 1]!.phase === CV_SAILING;
  }

  /**
   * 25mm の後・接触の前: 標的を選んで PtCheck に書く（heldFlashM は閃光の記憶。core/pt-target）。
   * 捉えている間に今の標的が valid でなくなって替わったら、その接触は受け継いだもの（新しい標的を誰かが見るまで。afterStep）
   */
  apply(q: PtSection, c: PtCheck, heldFlashM: number, nowS: number): void {
    this.heldFlashM = heldFlashM;
    const before = this.set.current;
    const forced = q.detected && !this.hulls[before]!.valid;
    applyPtTarget(q, c, this.set, pickPtTarget(q, this.set, heldFlashM, this.rule, nowS), nowS);
    if (forced && this.set.current !== before) this.inherited = true;
  }

  /**
   * 隊を進めた後（PtSquadron.step。lostBefore は進める前の q.lostContacts）: 受け継いだ接触がそのまま切れたなら inheritedLosses に数える
   * （core は今の標的が valid なら見失わせたに数える。沈んだ大発の接触の残りの秒が、見えていない自艇へ移って切れただけ）。捉えていない・どれかの PT が見ていれば受け継ぎは終わり
   */
  afterStep(lostBefore: number): void {
    const q = this.section;
    if (this.inherited && q.lostContacts > lostBefore) this.inheritedLosses++;
    if (!q.detected) this.inherited = false;
    for (let i = 0; this.inherited && i < q.seen.length; i++) if (q.seen[i] === 1) this.inherited = false;
  }

  /**
   * 3 行目の「発見された！」（mission-telemetry の playerDetected。v0.6.4 レビュー ux-2）: 隊が捉えていて、標的が自艇（大発からの受け継ぎの接触でない）か、自艇が的になれて（浮いていて輪の外）
   * まだ戦う PT のどれかが自艇の見つかる距離（速力帯と閃光の記憶の大きい方）の内。大発だけが見つかっている間は偽（隊の detected と Result の数えは変えない）。距離二乗・確保なし。
   * 受け継ぎ: 標的の大発が沈んで自艇へ替わった接触の残りの秒（ヘッドレスの none で 1,966 m 先の自艇に 0.6 秒「発見された！」が出た）
   */
  playerSeen(): boolean {
    const q = this.section;
    if (!q.detected) return false;
    if (this.set.current === 0 && !this.inherited) return true;
    const h = this.hulls[0]!;
    if (!h.valid) return false;
    const r = Math.max(this.set.detectM[0]!, this.heldFlashM);
    for (let i = 0; i < q.boats.length; i++) {
      const b = q.boats[i]!;
      if (ptFighting(b.phase) && (b.x - h.boat.x) * (b.x - h.boat.x) + (b.y - h.boat.y) * (b.y - h.boat.y) <= r * r) return true;
    }
    return false;
  }

  /** 狙われている大発（state.barges の index。ux-5 の印）: 隊が捉えているか攻撃中で、標的が航行中の大発。ほかは −1（自艇が標的・哨戒中・標的の大発が沈んだ・上陸した） */
  get aimedBarge(): number {
    const k = this.set.current;
    return k > 0 && k <= this.nb && this.hulls[k]!.valid && (this.section.detected || this.section.owner >= 0) ? k - 1 : -1;
  }

  /** 隊が捉えた立ち上がり（PtEvents.onContact）: 最初の 1 回だけ、そのときの標的を覚える */
  onContact(gained: boolean): void {
    if (!gained || this.contacted) return;
    this.contacted = true;
    this.firstDetectKind = this.targetKind;
  }

  /** 攻撃を固めた（PtEvents.onCommit）: 標的の種類と船体を固め、命中を 0 から。core の航過の数を覚える */
  onCommit(i: number): void {
    this.attackOwner = i;
    this.attackOpen = true;
    this.attackHull = this.set.current;
    this.attackKind = this.targetKind;
    this.attackHits = 0;
    this.passesAtCommit = this.section.passes;
  }

  /** core が onPassEnd 無しで閉じた攻撃（25mm で沈んだ PT の dropOwner＝PtSquadron の onFate、夜明け＝onLeave）: 終わった攻撃として数える。開いていない・別の PT なら何もしない */
  dropAttack(i: number, fired: boolean): void {
    if (this.attackOpen && this.attackOwner === i) this.onPassEnd(fired);
  }

  /**
   * PT が去る（PtEvents.onLeave）: 夜明けの latch（core/pt-boats）は航過・連射を数えて onLeave だけを呼ぶので、その PT の攻撃が開いていれば閉じる
   * （撃ったかはその PT の firedThisPass。撃たずに切れた航過では core の lastPassFired は前の攻撃のまま）。endPass・endBurst の後・連射の使い切り・撃退の onLeave は開いた攻撃の PT ではないので何もしない
   */
  onLeave(i: number): void {
    this.dropAttack(i, this.section.boats[i]!.firedThisPass > 0);
  }

  /**
   * 攻撃が終わった（PtEvents.onPassEnd・dropAttack）: 自艇への攻撃なら撃った・無傷を数え、大発への航過は core が数えたときだけ数え、最後の攻撃の標的と命中を覚える（後から落ちた弾はここへ戻す）。
   * 撃たずに終わり、その PT が 25mm の結末（撃退・撃沈）を受けていれば lastPassSilenced（ux-7）
   */
  onPassEnd(fired: boolean): void {
    this.attackOpen = false;
    this.lastHull = this.attackHull;
    this.lastPassTargetKind = this.attackKind;
    this.lastAttackTargetHits = this.attackHits;
    this.lastFired = fired;
    this.lastPassSilenced = !fired && this.attackOwner >= 0 && this.section.boats[this.attackOwner]!.fate !== PT_FATE_NONE;
    if (this.attackKind === 1 && this.section.passes > this.passesAtCommit) this.attacksOnBarges++;
    if (this.attackKind !== 0) return;
    if (fired) this.firedPassesOnPlayer++;
    if (fired && this.attackHits === 0) this.cleanPassesOnPlayer++;
  }

  /** 自艇への命中（世界が被害を当てた後）。沈み始めたら自艇の船体を落とす（標的なら同じステップの残りの弾は当たらない） */
  playerHit(q: PtSection, c: PtCheck, sinking: boolean): void {
    this.playerHits++;
    this.countHit(q, 0);
    if (!sinking) return;
    this.hulls[0]!.valid = false;
    if (this.set.current === 0) c.targetValid = false;
  }

  /** 着弾の船体の振り分け（PtSquadron.onImpact から移した）: 自艇（hull が無いか 0）は false（世界が自艇の被害を当てる）、大発（1..nb）は bargeHit して true。確保なし・乱数なし */
  hullHit(q: PtSection, c: PtCheck, hull: number | undefined, damage: number, nowS: number): boolean {
    if (hull === undefined || hull <= 0) return false;
    if (hull <= this.nb) this.bargeHit(q, c, hull, damage, nowS);
    return true;
  }

  /** 大発への命中（1 ≤ hull ≤ nb）: HP だけ（乱数なし）。沈んだら同じステップで valid（標的なら targetValid も）を落とし true */
  bargeHit(q: PtSection, c: PtCheck, hull: number, damage: number, nowS: number): boolean {
    this.bargeHits++;
    this.countHit(q, hull);
    if (!this.convoy.hit(hull - 1, damage, nowS)) return false;
    this.hulls[hull]!.valid = false;
    if (this.set.current === hull) c.targetValid = false;
    return true;
  }

  /** 攻撃の標的の船体への命中を数える: 攻撃中（owner ≥ 0）はその攻撃へ、終わった後に落ちた弾は最後の攻撃へ（攻撃は同時に 1 つで gap ≥ 2 秒 > 弾の飛行なので取り違えない。core の cleanPasses-- と同じ） */
  private countHit(q: PtSection, hull: number): void {
    if (q.owner >= 0) {
      if (hull === this.attackHull) this.attackHits++;
      return;
    }
    if (hull !== this.lastHull) return;
    if (this.lastAttackTargetHits++ === 0 && this.lastFired && this.lastPassTargetKind === 0) this.cleanPassesOnPlayer--;
  }
}
