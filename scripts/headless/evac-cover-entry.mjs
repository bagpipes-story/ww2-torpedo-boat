// 空襲下の退避（v0.6.11 IP2 の U11。jp_03）の陰の絵の画面写しのページの中の半分。evac-cover.mjs が esbuild で束ねて jp_03 のページに入れる。
// 模擬の台本（既定 seq_cover＝陰を先に）の入力を世界へ写して進め、操作中の隊が陰へ向かう途中（at=approach: 隊長艇が陰の点から NEAR m の内・走っている）・
// 陰に隠れている（at=hidden: G_HIDDEN を HOLD 秒）・陰で見つかった（at=found: どれかの隊が G_FOUND。カメラの追従を止めて陰の点を真ん中に）のどれかで止める。
import { gameData } from '../../src/config/game-data';
import { runEvacTrial } from '../../src/core/evac-sim';
import { evacSimSetup } from '../../src/systems/evac-sim-setup';
import { pressSwitch } from './wvs-evac-entry.mjs';

const G_UNDERWAY = 1;
const G_HIDDEN = 4;
const G_FOUND = 5;
const SHELTER_COVER = 1;

export function coverProbe(o) {
  const hl = window.__hl;
  const w = hl.world();
  if (!w.evac) throw new Error('空襲下の退避の任務ではない');
  const s = evacSimSetup(gameData, o.hard);
  const inp = w.input;
  const sq = w.evac.sq;
  const ci = sq.p.shelters.findIndex((x) => x.kind === SHELTER_COVER);
  const cv = sq.p.shelters[ci];
  let stop = false;
  let since = -1;
  const mirror = {
    begin() {},
    frame(k, fo) {
      if (stop) throw new Error('stop');
      if (!hl.active('Mission')) throw new Error('mission-ended');
      if (k > o.maxSteps) throw new Error('その所が来ない');
      inp.stickActive = true;
      inp.headingDeg = fo.headingDeg;
      inp.speed01 = fo.speed01;
      inp.gunHeld = fo.gunHeld;
      inp.extinguishHeld = fo.extHeld;
      inp.lookout = o.lookS >= 999;
      if (fo.switchTap) pressSwitch();
      hl.frame(o.frameMs);
    },
    after(k) {
      const g = sq.groups[sq.control];
      const lead = g.boats[g.leader].state;
      const d = Math.hypot(lead.x - cv.x, lead.y - cv.y);
      let ok = false;
      if (o.at === 'approach') ok = g.phase === G_UNDERWAY && d < o.near && d > o.near * 0.6;
      else if (o.at === 'hidden') ok = g.phase === G_HIDDEN && g.shelter === ci;
      else if (o.at === 'found') ok = sq.groups.some((x) => x.phase === G_FOUND && x.shelter === ci); // どれかの隊が陰で見つかった（撮る前にカメラを陰へ）
      if (!ok) { since = -1; return; }
      if (since < 0) since = k;
      if (k - since >= o.holdS * 60) stop = true;
    },
  };
  try {
    runEvacTrial(s, o.policy, o.seed, null, mirror);
  } catch (e) {
    if (!(e instanceof Error) || e.message !== 'stop') throw e;
  }
  if (!stop) throw new Error(`${o.at} が来ないまま終わった`);
  for (let i = 0; i < 90; i++) hl.render();
  const m = hl.mission();
  const cam = m.cameras.main;
  if (o.at === 'found') {
    cam.stopFollow();
    cam.centerOn(cv.x, cv.y);
    for (let i = 0; i < 3; i++) hl.render();
  }
  return { t: w.stepTimeS, zoom: cam.zoom / window.__game.scene.getScene('Hud').cameras.main.zoom, phases: sq.groups.map((g) => g.phase), control: sq.control, objs: m.children.list.length };
}

window.__evCover = { coverProbe };
