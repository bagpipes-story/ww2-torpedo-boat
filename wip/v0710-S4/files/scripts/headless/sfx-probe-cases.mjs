// 音の probe の件と台本（v0.7.1 S4 で scripts/headless/sfx-probe.mjs から分けた。開発の道具だけ・ゲームは import しない）。
// 件: 名前・query・秒・台本（mode。無ければ ab＝ab-replay の台本）・その件で 1 回以上鳴るはずの鍵（expect＝絵の層の口の単発・cues＝位置なしの合図（core/sfx-cues と Result の鐘。S4）・loops_expect＝ループ。
// spec §3.4 の表のうち、この台本と seed で実際に起きる出来事＝決定的。遊びを変えたら直す）。
// 台本: ab＝最寄りの敵へ向かい、魚雷 12 秒ごと・機銃 8 秒のうち 3 秒。hold＝ab の操舵のまま機銃を押しっぱなし（連射の最悪）。home＝何も撃たずに帰投地点へ巡航。
//   cue（S4）＝合図の出来事を起こす台本: 目標（to＝[x, y] の世界の m。無ければ最寄りの敵）へ速さ speed で向かい、gun で機銃を押しっぱなし・smokeAt 秒に煙幕・燃えたら消火を長押し・
//   味方機の識別の要求が出たら 1 秒後に識別・switchEvery 秒ごとに［切替］（jp_03）・torpEvery 秒ごとに魚雷・torpAt 秒に魚雷 1 本。home は帰投地点へ（味方機は魚雷を撃った後の帰り道に来る）。
// S4 で足した件: 味方機（&ff＝必ず来る。識別の要求の警報・識別の信号弾）・機関の不調（jp_05 の &enghot）・座礁（us_02 の浅瀬へ全速）・燃料切れ（&fuel=）・煙幕と消火（us_01）・
//   jp_03 の［切替］・jp_04 の米PT の雷撃の報告（止まって待つ＝ab の台本では米PT が撃つ前に沈む）。
export const CASES = [
  { name: 'us_01', q: 'mission=us_01&seed=1', secs: 200, cues: ['torp_launch', 'alarm', 'light_on', 'hull_hit', 'bell'], expect: ['gun_near', 'splash_s', 'splash_l', 'blast_s'], loops_expect: ['fire'] },
  { name: 'us_01h', q: 'mission=us_01&seed=1&hard', secs: 200, cues: ['torp_launch', 'alarm', 'light_on', 'hull_hit', 'bell'], expect: ['gun_near', 'gun_far', 'splash_s', 'splash_l', 'blast_s'], loops_expect: ['fire'] },
  { name: 'us_02', q: 'mission=us_02&seed=1', secs: 200, cues: ['torp_launch', 'alarm', 'light_on', 'reload', 'engine_cough', 'bell'], expect: ['mg', 'gun_near', 'splash_s', 'splash_l', 'blast_s', 'torp_hit', 'sink'] },
  { name: 'us_02h', q: 'mission=us_02&seed=1&hard', secs: 200, cues: ['torp_launch', 'alarm', 'light_on', 'hull_hit', 'engine_cough', 'bell'], expect: ['gun_near', 'splash_s', 'splash_l', 'blast_s', 'blast_l'], loops_expect: ['fire'] },
  { name: 'us_03', q: 'mission=us_03&seed=1', secs: 200, cues: ['torp_launch', 'alarm', 'hull_hit', 'blast_s', 'bell'], expect: ['mg', 'gun_near', 'splash_s', 'blast_s', 'blast_l'], loops_expect: ['fire'] },
  { name: 'us_03h', q: 'mission=us_03&seed=1&hard', secs: 200, cues: ['torp_launch', 'alarm', 'hull_hit', 'blast_s', 'bell'], expect: ['mg', 'gun_near', 'splash_s', 'blast_s', 'blast_l'], loops_expect: ['fire'] },
  { name: 'jp_01', q: 'mission=jp_01&seed=1', secs: 200, cues: ['torp_launch', 'alarm', 'hull_hit', 'engine_cough', 'bell'], expect: ['mg', 'splash_s', 'blast_s'] },
  { name: 'jp_01h', q: 'mission=jp_01&seed=1&hard', secs: 200, cues: ['torp_launch', 'alarm', 'reload', 'hull_hit', 'engine_cough', 'bell'], expect: ['mg', 'splash_s', 'splash_l', 'blast_s', 'blast_l', 'sink'] },
  { name: 'jp_02', q: 'mission=jp_02&seed=1', secs: 200, cues: ['bomb_fall', 'hull_hit', 'engine_cough', 'bell'], expect: ['blast_l'], loops_expect: ['fire', 'drone'] },
  { name: 'jp_03', q: 'mission=jp_03&seed=1', secs: 260, cues: ['alarm', 'bomb_fall', 'hull_hit', 'engine_cough', 'ui_tap', 'smoke', 'bell'], expect: ['splash_l', 'blast_l', 'sink'], loops_expect: ['fire', 'drone'] },
  { name: 'jp_03h', q: 'mission=jp_03&seed=1&hard', secs: 260, cues: ['alarm', 'bomb_fall', 'hull_hit', 'engine_cough', 'ui_tap', 'smoke', 'bell'], expect: ['splash_l', 'blast_l', 'sink'], loops_expect: ['fire', 'drone'] },
  { name: 'jp_04', q: 'mission=jp_04&seed=1', secs: 170, cues: ['torp_launch', 'alarm', 'hull_hit', 'engine_cough', 'bell'], expect: ['mg', 'gun_near', 'splash_s', 'blast_s', 'torp_hit', 'sink'] },
  { name: 'jp_04h', q: 'mission=jp_04&seed=1&hard', secs: 170, cues: ['torp_launch', 'alarm', 'hull_hit', 'reload', 'engine_cough', 'bell'], expect: ['mg', 'gun_near', 'splash_s', 'blast_s', 'torp_hit', 'sink'], loops_expect: ['fire'] },
  { name: 'jp_05', q: 'mission=jp_05&seed=1', secs: 200, cues: ['torp_launch', 'alarm', 'hull_hit', 'engine_cough', 'ui_tap', 'bell'], expect: ['mg', 'splash_s', 'blast_s'] },
  { name: 'jp_06', q: 'mission=jp_06&seed=1', secs: 200, cues: ['torp_launch', 'alarm', 'light_on', 'hull_hit', 'bell'], expect: ['gun_near', 'splash_s', 'splash_l', 'blast_s'] },
  { name: 'jp_06h', q: 'mission=jp_06&seed=1&hard', secs: 200, cues: ['torp_launch', 'alarm', 'light_on', 'hull_hit', 'bell'], expect: ['gun_near', 'splash_s', 'splash_l', 'blast_s'], loops_expect: ['fire'] },
  // S3: ループの件（暴風の雨・水上機の爆撃・水上機の接近・夜明けの空襲。&fixed＝夜の揺らぎなしで危険が全部出る）
  { name: 'us_02-storm', q: 'mission=us_02&seed=1&fixed&storm=3000', secs: 60, cues: ['torp_launch', 'alarm', 'light_on', 'hull_hit', 'engine_cough'], expect: [], loops_expect: ['rain'] },
  { name: 'us_02-plane', q: 'mission=us_02&seed=1&fixed&plane=attack', secs: 120, cues: ['torp_launch', 'alarm', 'flare_pop', 'hull_hit', 'bomb_fall', 'bell'], expect: [], loops_expect: ['drone'] },
  { name: 'us_02-home', q: 'mission=us_02&seed=1&fixed&nostorm', secs: 120, mode: 'home', cues: ['alarm', 'light_on', 'blast_s', 'bell'], expect: [], loops_expect: ['drone'] },
  { name: 'us_01-dawn', q: 'mission=us_01&seed=1&dawn=20', secs: 90, cues: ['torp_launch', 'alarm', 'light_on', 'hull_hit', 'bomb_fall', 'bell'], expect: [], loops_expect: ['drone'] },
  // S4: 合図の件（spec §3.2・§3.4 の表を埋める）
  { name: 'us_02-ff', q: 'mission=us_02&seed=1&fixed&nostorm&noplane&ff', secs: 150, mode: 'cue', home: true, speed: 0.4, torpAt: 3, identify: true, cues: ['torp_launch', 'alarm', 'flare_pop', 'light_on', 'hull_hit', 'bell'], expect: [], loops_expect: ['drone'] },
  { name: 'us_02-ground', q: 'mission=us_02&seed=1&nostorm', secs: 90, mode: 'cue', to: [4650, 1300], speed: 1, cues: ['alarm', 'light_on', 'blast_s', 'bell'], expect: [] },
  { name: 'us_02-fuel', q: 'mission=us_02&seed=1&nostorm&noplane&fuel=10', secs: 150, mode: 'cue', to: [300, 3700], speed: 1, cues: ['alarm', 'light_on', 'engine_cough', 'bell'], expect: [] },
  { name: 'us_01-chores', q: 'mission=us_01&seed=1', secs: 200, mode: 'cue', gun: true, smokeAt: 20, extinguish: true, torpEvery: 12, cues: ['torp_launch', 'smoke', 'alarm', 'light_on', 'hull_hit', 'bell'], expect: [] },
  { name: 'jp_04-salvo', q: 'mission=jp_04&seed=1', secs: 90, mode: 'cue', speed: 0, cues: ['torp_launch'], expect: ['sink'] },
  { name: 'jp_05-hot', q: 'mission=jp_05&seed=1&enghot', secs: 200, mode: 'cue', speed: 1, torpEvery: 12, cues: ['torp_launch', 'alarm', 'hull_hit', 'engine_cough', 'ui_tap', 'bell'], expect: [] },
  { name: 'jp_03-switch', q: 'mission=jp_03&seed=1', secs: 120, mode: 'cue', speed: 0.6, switchEvery: 15, gun: true, cues: ['alarm', 'ui_tap', 'reload', 'bomb_fall'], expect: [], loops_expect: ['drone'] },
  // 混む窓（mix の門の 4 件。記録の全部ではなく一番混む 10 秒を scripts/sfx-mix が切り出す）
  { name: 'us_03-burst', q: 'mission=us_03&seed=1&barges=near', secs: 90, mode: 'hold', cues: ['torp_launch', 'alarm', 'hull_hit', 'smoke', 'blast_s', 'bell'], expect: ['mg', 'splash_s', 'blast_l'], loops_expect: ['fire'] },
  { name: 'jp_03h-last', q: 'mission=jp_03&seed=2&hard', secs: 260, mode: 'hold', cues: ['alarm', 'bomb_fall', 'reload', 'hull_hit', 'ui_tap', 'bell'], expect: ['mg', 'splash_l', 'blast_l'], loops_expect: ['fire', 'drone'] },
  { name: 'jp_04h-busy', q: 'mission=jp_04&seed=2&hard', secs: 170, mode: 'hold', cues: ['torp_launch', 'alarm', 'hull_hit', 'reload', 'bell'], expect: ['mg', 'gun_near', 'torp_hit', 'sink'] },
  { name: 'us_02h-busy', q: 'mission=us_02&seed=2&hard', secs: 200, mode: 'hold', cues: ['torp_launch', 'alarm', 'hull_hit', 'light_on', 'bell'], expect: ['gun_near', 'splash_s', 'blast_s'], loops_expect: ['drone'] },
];

/** ページの中: hold の台本（ab の操舵のまま、機銃を押しっぱなし・魚雷は 12 秒ごと） */
export function holdRun(o) {
  const hl = window.__hl;
  const w = hl.world();
  let lastTorp = -1;
  for (let k = 0; k < Math.round(o.secs * 60); k++) {
    if (!hl.active('Mission')) break;
    const t = w.stepTimeS;
    const b = w.boat.state;
    const f = w.enemy.focus(b.x, b.y);
    const dist = f ? Math.hypot(f.x - b.x, f.y - b.y) : Infinity;
    if (t < 2) hl.steer(NaN, 0);
    else if (f && dist < o.near) hl.steer(hl.bearing(f.x, f.y, b.x, b.y), 0.6);
    else if (f) hl.steer(hl.bearing(b.x, b.y, f.x, f.y), dist > 1800 ? 0.6 : 0.4);
    else hl.steer((90 + t * 2) % 360, 0.5);
    const slot = Math.floor(t / 12);
    if (t > 8 && slot !== lastTorp && dist < 2500) { w.input.fireTap = true; lastTorp = slot; }
    w.input.gunHeld = true;
    hl.frame(o.frameMs);
  }
}

/** ページの中: home の台本（何も撃たずに帰投地点へ向かう。帰投地点は Hud のテレメトリの相対位置を読むだけ） */
export function homeRun(o) {
  const hl = window.__hl;
  const t = window.__game.scene.getScene('Hud').telemetry;
  for (let k = 0; k < Math.round(o.secs * 60); k++) {
    if (!hl.active('Mission')) break;
    hl.steer(hl.bearing(0, 0, t.homeDx, t.homeDy), 0.6);
    hl.frame(o.frameMs);
  }
}

/** ページの中: cue の台本（頭の注。テレメトリは Hud の物を読むだけ） */
export function cueRun(o) {
  const hl = window.__hl;
  const w = hl.world();
  const tel = window.__game.scene.getScene('Hud').telemetry;
  const speed = o.speed ?? 0.6;
  let challengeAt = -1;
  let lastTorp = -1;
  let lastSwitch = 0;
  let smoked = false;
  for (let k = 0; k < Math.round(o.secs * 60); k++) {
    if (!hl.active('Mission')) break;
    const t = w.stepTimeS;
    const b = w.boat.state;
    const f = o.home ? { x: b.x + tel.homeDx, y: b.y + tel.homeDy } : o.to ? { x: o.to[0], y: o.to[1] } : w.enemy.focus(b.x, b.y);
    if (t < 2) hl.steer(NaN, 0);
    else if (f) hl.steer(hl.bearing(b.x, b.y, f.x, f.y), speed);
    else hl.steer((90 + t * 2) % 360, speed);
    if (o.gun) w.input.gunHeld = true;
    if (o.smokeAt !== undefined && !smoked && t >= o.smokeAt) { w.input.smokeTap = true; smoked = true; }
    if (o.extinguish && tel.onFire) w.input.extinguishHeld = true;
    if (o.identify) {
      if (tel.friendlyPhase === 1 && challengeAt < 0) challengeAt = t;
      if (challengeAt >= 0 && t - challengeAt > 1 && tel.friendlyPhase === 1) w.input.identifyTap = true;
      if (tel.friendlyPhase !== 1) challengeAt = -1;
    }
    if (o.switchEvery && t - lastSwitch >= o.switchEvery) { w.input.switchTap = true; lastSwitch = t; }
    if (o.torpAt !== undefined && lastTorp < 0 && t >= o.torpAt) { w.input.fireTap = true; lastTorp = 0; }
    if (o.torpEvery) { const slot = Math.floor(t / o.torpEvery); if (t > 8 && slot !== lastTorp) { w.input.fireTap = true; lastTorp = slot; } }
    hl.frame(o.frameMs);
  }
}
