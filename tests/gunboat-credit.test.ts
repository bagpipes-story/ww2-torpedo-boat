// 自艇と隼艇の 25mm の手柄の分け（v0.6.6。systems/gunboat-credit・systems/pt-telemetry。spec-v066 §C.4 #26・§N-8・§G・レビュー R8）: PtSection を手で組む固定の fixture。
// 砲の段は PtSquadron と同じ形で立て替える: 命中ごとに core/pt-damage の hitPt、隼艇の砲は段の前後を noteGunboatGun、結末が変わった命中の砲が fateBy を書く（PtSquadron.onFate）。
// 撃退してから別の砲が沈めた PT は沈めた砲の撃沈だけ（差で数えると自艇の撃退が −1 になる）。どの夜も 自艇の分 + 隼艇の分 = 隊の数（ptResult の retired・sunk・q.gunHits・q.suppressions）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { PT_CHASE, PT_FATE_NONE, PT_PASS, PT_RUN_IN, createPtSection, createPtTelemetry, ptFighting, type PtEvents, type PtSection } from '../src/core/pt-boats';
import { hitPt } from '../src/core/pt-damage';
import { SeededRng } from '../src/core/rng';
import { FATE_BY_GUNBOAT, FATE_BY_PLAYER, createGunboatCredit, gunboatFates, noteGunboatGun, type GunboatCredit } from '../src/systems/gunboat-credit';
import { ptResult, refreshPtTelemetry, type PtTelemetryWorld } from '../src/systems/pt-telemetry';
import { buildWorldSetup } from '../src/systems/world-setup';
import { ptHeadJa } from '../src/ui/pt-lines';

const H = buildWorldSetup(gameData, 'jp_01', { hard: true });
const PT = H.ptBoats!;
const DMG = H.gunboat!.gun.groups[0]!.damage;
const ev: PtEvents = { onContact: () => {}, onCommit: () => {}, onFire: () => {}, onImpact: () => {}, onPassEnd: () => {}, onLeave: () => {}, onOut: () => {} };
/** hitPt の u: 引火で沈む・死傷で去る・どれでもない（HP が retreat_hp より上なら結末なし） */
const U_SINK = PT.fireChance / 2;
const U_CREW = PT.fireChance + PT.casualtyChance / 2;
const U_NONE = 0.999;

/** 隊・手柄・自艇の分の命中と制圧（自艇の砲の段の前後の差。PtSquadron には無い数え＝和の検査のため） */
function fixture(): { q: PtSection; cr: GunboatCredit; own: { hits: number; supp: number } } {
  const q = createPtSection(PT, 24);
  for (const b of q.boats) b.phase = PT_RUN_IN;
  return { q, cr: createGunboatCredit(q.boats.length), own: { hits: 0, supp: 0 } };
}

/** 1 発（by の砲が生きた PT i に当てた）: PtSquadron と同じく、隼艇の砲は段の前後を noteGunboatGun、結末が変わった命中は fateBy に砲を書く */
function shot(f: ReturnType<typeof fixture>, by: number, i: number, u: number): void {
  const { q, cr, own } = f;
  const [h0, u0, e0, fate0] = [q.gunHits, q.suppressions, q.gunEventSeq, q.boats[i]!.fate];
  hitPt(q, PT, i, DMG, u, ev);
  if (by === FATE_BY_GUNBOAT) noteGunboatGun(cr, q, h0, u0, e0);
  else {
    own.hits += q.gunHits - h0;
    own.supp += q.suppressions - u0;
  }
  if (q.boats[i]!.fate !== fate0) cr.fateBy[i] = by;
}

function teleWorld(q: PtSection, cr: GunboatCredit): PtTelemetryWorld {
  return { pts: { section: q, p: PT, firstDetectBand: '', enemyId: 'us_pt_enemy', gun: null, targets: null, gunboat: { credit: cr } }, boat: { state: { ...H.playerStart, speedMps: 0 } }, params: H.boatParams, visRange2: H.visRange2, damageParams: H.damageParams };
}

describe('手柄の分け（systems/gunboat-credit）', () => {
  it('撃退してから別の砲が沈めた PT（隼艇が撃退 → 航過のまま → 自艇が沈める）: 自艇の撃沈 1・撃退 0、隼艇の撃退 0・撃沈 0、頭の行は「撃沈 1」で撃退なし', () => {
    const f = fixture();
    const { q, cr } = f;
    Object.assign(q.boats[0]!, { phase: PT_PASS });
    q.owner = 0; // 航過中に撃退された PT は撃つのをやめ、固めた針路のまま抜ける（まだ当たる）
    shot(f, FATE_BY_GUNBOAT, 0, U_CREW);
    expect([q.boats[0]!.fate !== PT_FATE_NONE, q.boats[0]!.phase, cr.fateBy[0]]).toEqual([true, PT_PASS, FATE_BY_GUNBOAT]);
    shot(f, FATE_BY_PLAYER, 0, U_SINK);
    expect(cr.fateBy[0]).toBe(FATE_BY_PLAYER);
    const r = ptResult(teleWorld(q, cr))!;
    const gb = gunboatFates(q, cr);
    expect([r.retired, r.sunk]).toEqual([0, 1]);
    expect(gb).toEqual({ retired: 0, sunk: 0 });
    expect([r.retired - gb.retired, r.sunk - gb.sunk]).toEqual([0, 1]);
    expect(ptHeadJa(r)).toContain('撃沈 1');
    expect(ptHeadJa(r)).not.toContain('撃退');
    // 命中は差で分ける: 隼艇 1・自艇 1
    expect([cr.hits, f.own.hits, q.gunHits]).toEqual([1, 1, 2]);
  });
  it('逆（自艇が撃退 → 隼艇が沈める）: 隼艇の撃沈 1、自艇の撃退 0・撃沈 0。出来事の番号は隼艇の砲が起こした最後のもの', () => {
    const f = fixture();
    const { q, cr } = f;
    Object.assign(q.boats[1]!, { phase: PT_PASS });
    q.owner = 1;
    shot(f, FATE_BY_PLAYER, 1, U_CREW);
    const seqPlayer = q.gunEventSeq;
    expect(cr.eventSeq).toBe(0);
    shot(f, FATE_BY_GUNBOAT, 1, U_SINK);
    expect(cr.eventSeq).toBe(q.gunEventSeq);
    expect(cr.eventSeq).toBeGreaterThan(seqPlayer);
    const r = ptResult(teleWorld(q, cr))!;
    expect(gunboatFates(q, cr)).toEqual({ retired: 0, sunk: 1 });
    expect([r.retired, r.sunk]).toEqual([0, 1]);
  });
  it('どの夜も 自艇の分 + 隼艇の分 = 隊の数（撃退・撃沈・命中・制圧）。乱数の夜 200 本（追撃中の PT は制圧も起きる）', () => {
    const rng = new SeededRng(20261025);
    for (let n = 0; n < 200; n++) {
      const f = fixture();
      const { q, cr } = f;
      for (let i = 0; i < q.boats.length; i++) if (rng.next() < 0.5) q.boats[i]!.phase = PT_CHASE;
      for (let k = 0; k < 40; k++) {
        const i = Math.floor(rng.next() * q.boats.length);
        if (!ptFighting(q.boats[i]!.phase)) continue; // 砲は生きた PT にだけ当てる（gun-battery の ptLive）
        q.owner = q.boats[i]!.phase === PT_PASS ? i : -1;
        const u = rng.next() < 0.3 ? [U_SINK, U_CREW, U_NONE][Math.floor(rng.next() * 3)]! : rng.next();
        shot(f, rng.next() < 0.5 ? FATE_BY_GUNBOAT : FATE_BY_PLAYER, i, u);
      }
      const r = ptResult(teleWorld(q, cr))!;
      const gb = gunboatFates(q, cr);
      let own = 0;
      let ownSunk = 0;
      for (let i = 0; i < q.boats.length; i++) {
        if (cr.fateBy[i] !== FATE_BY_PLAYER) continue;
        if (q.boats[i]!.fate === 3) ownSunk++;
        else if (q.boats[i]!.fate !== PT_FATE_NONE) own++;
      }
      expect([own + gb.retired, ownSunk + gb.sunk]).toEqual([r.retired, r.sunk]);
      expect([f.own.hits + cr.hits, f.own.supp + cr.suppressions]).toEqual([q.gunHits, q.suppressions]);
      for (let i = 0; i < q.boats.length; i++) expect(cr.fateBy[i] === 0).toBe(q.boats[i]!.fate === PT_FATE_NONE);
    }
  });
  it('HUD の「命中 計 N」（PtTelemetry.gunHits）は自艇の分。隼艇の無い任務（gunboat なし）は隊の数のまま', () => {
    const f = fixture();
    shot(f, FATE_BY_GUNBOAT, 0, U_NONE);
    shot(f, FATE_BY_GUNBOAT, 0, U_NONE);
    shot(f, FATE_BY_PLAYER, 2, U_NONE);
    const t = createPtTelemetry();
    refreshPtTelemetry(t, teleWorld(f.q, f.cr));
    expect([t.gunHits, f.q.gunHits]).toEqual([1, 3]);
    const w = teleWorld(f.q, f.cr);
    refreshPtTelemetry(t, { ...w, pts: { ...w.pts!, gunboat: null } });
    expect(t.gunHits).toBe(3);
  });
  it('配線（ソース）: PtSquadron の自艇の砲は FATE_BY_PLAYER、隼艇の砲は FATE_BY_GUNBOAT で onFate へ、onFate は最初に fateBy を書く。隼艇の fire は砲の段の前後で noteGunboatGun', () => {
    const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const sq = strip(readFileSync('src/systems/pt-squadron.ts', 'utf8'));
    expect(sq).toContain('(i, fate) => this.onFate(scene, i, fate, FATE_BY_PLAYER)');
    expect(sq).toContain('onFate: (i, fate) => this.onFate(scene, i, fate, FATE_BY_GUNBOAT)');
    expect(sq).toMatch(/private onFate\(scene: Phaser\.Scene, i: number, fate: number, by: number\): void \{\s*if \(this\.gunboat\) this\.gunboat\.credit\.fateBy\[i\] = by;/);
    const gb = strip(readFileSync('src/systems/gunboat.ts', 'utf8'));
    const fire = gb.slice(gb.indexOf('fire(t: PtTargets'), gb.indexOf('contactFlash(c: PtCheck'));
    const [h0, step, note] = [fire.indexOf('const h0 = q.gunHits;'), fire.indexOf('this.gun.step(this.state.band, this.state.held, this.state.valid'), fire.indexOf('noteGunboatGun(this.credit, q, h0, u0, e0);')];
    expect([h0, step, note].every((i) => i > 0), `${h0} ${step} ${note}`).toBe(true);
    expect(h0).toBeLessThan(step);
    expect(step).toBeLessThan(note);
  });
});
