// v0.8.2 S0（spec-v0820 §4.3・§5.2）: enemies.json の戦艦（扶桑型）と重巡（最上型）の 2 記録の鍵・AI と砲の形・艦種、と今の記録・data が 1 字も変わらないこと
// （ijn_destroyer は命中率の KPI を合わせた値。値は main 0176202 の data の JSON.stringify の sha256）。戦艦・重巡の砲の強さは S3 の gunnery-sim で合わせる（S0 は初めの値）。
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { gameData, getEnemyRecord } from '../src/config/game-data';
import { gunneryParamsFromData } from '../src/core/gunnery';
import { shipAiParamsFromData } from '../src/core/ship-ai';
import { destroyerSetup } from '../src/systems/destroyer-setup';

type Rec = Record<string, unknown>;
const ENEMIES = gameData.enemies.enemies as unknown as Rec[];
const rec = (id: string): Rec => ENEMIES.find((e) => e['id'] === id)!;
const sha = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const gun = (id: string, gid: string): Rec => (rec(id)['guns'] as Rec[]).find((g) => g['id'] === gid)!;
const KEYS = ['id', 'faction', 'name_ja', 'ship_class', 'length_m', 'beam_m', 'speed_max_kt', 'speed_typical_kt', 'turn_rate_deg_s', 'accel_mps2', 'hull_hp', 'hull_circles', 'torpedo_hits_to_sink', 'guns', 'searchlight', 'starshell', 'detection', 'evasion', 'ram', 'patrol', 'source', 'notes'];

describe('今の記録と data は main 0176202 のまま（新しい記録・鍵を足しただけ）', () => {
  it('ijn_destroyer・ijn_light_cruiser・ijn_subchaser・ijn_destroyer_mutsuki_enemy の記録が 1 字も同じ・記録の並びは新しい 2 つを駆潜艇の後ろに足しただけ', () => {
    expect([sha(rec('ijn_destroyer')), sha(rec('ijn_light_cruiser')), sha(rec('ijn_subchaser')), sha(rec('ijn_destroyer_mutsuki_enemy'))]).toEqual([
      '55ca437928ed0840201aa5da86ee14a862f96e180950cd58817062f2e6047178', 'd23984ecf23cdbf825f93f05eb67e7ace4c7a30932aa96e9af581354cb667849',
      'da7f11bfa4848a46e87736b65c10facf2ad40387892b77e00102756af3df4afc', 'b625abdde6bf18682fbea6252caa7a13e26eebc20d911ca6840f0ce5bc1cd7d3',
    ]);
    const ids = ENEMIES.map((e) => e['id']);
    expect(ids.slice(ids.indexOf('ijn_subchaser'), ids.indexOf('ijn_subchaser') + 4)).toEqual(['ijn_subchaser', 'ijn_battleship_fuso', 'ijn_cruiser_mogami', 'daihatsu_barge']);
    expect(ids.length).toBe(19);
  });
  // v0.8.5 S0: us_07 を書き直し（spec-v0850 §2.2）・order を年代順に（us_06 6 → 7・us_05 5 → 6）・risk_events の mine に params・scoring.json に 3 つの鍵（rescue）。
  // 今の値は us_07 と us_05 を除き us_06 の order を 6 に戻した sha（main 38acd73 の data で同じ式が同じ値。main 0176202 の式の値 669f69e0… は 38acd73 でも同じだった）・mine は params を外した sha（0176202 の値のまま）
  it('missions_seed の us_05・us_07 以外の任務（us_06 の order は v0.8.5 で 7）・risk_events の radio_failure 以外の記録（mine は v0.8.5 の params の他）は 1 字も同じ。scoring.json は v0.8.2・v0.8.5 で 3 つずつ鍵を足しただけ（今の値は変えない）', () => {
    const ms = gameData.missionsSeed as unknown as Rec;
    // v0.9.0 IP2: us_02・jp_06 に Result の「達成の条件」の文 achieve_ja（とその source）を足した＝鍵 2 つだけ。それを外せば同じ
    const ACHIEVE = (ms['missions'] as Rec[]).filter((m) => m['achieve_ja'] !== undefined).map((m) => m['id']);
    expect(ACHIEVE).toEqual(['us_02', 'jp_06']);
    const missions = (ms['missions'] as Rec[]).filter((m) => m['id'] !== 'us_05' && m['id'] !== 'us_07').map((m) => { const { achieve_ja: _a, achieve_ja_source: _s, ...rest } = m; return rest['id'] === 'us_06' ? { ...rest, order: 6 } : rest; });
    // v0.8.5 S5: jp_hard の source に解放の一覧の注（「。v0.8.0 からは上の unlock_mission_ids で…3 任務」）を足した＝文だけ。それを外せば同じ
    const S5_NOTE = '。v0.8.0 からは上の unlock_mission_ids で us_01〜us_03 に固定＝v0.8.5 で us_07 が遊べるようになっても 3 任務';
    const campaigns = (ms['campaigns'] as Rec[]).map((c) => (c['id'] === 'jp_hard' ? { ...c, source: String(c['source']).replace(S5_NOTE, '') } : c));
    expect(String((ms['campaigns'] as Rec[])[1]!['source'])).toContain(S5_NOTE);
    expect(sha({ ...ms, campaigns, missions })).toBe('1e48bf5ee682774b80d06ad8b434ab7165df73023d2e56ffce40498bb291ccd9');
    const re = gameData.riskEvents as unknown as Rec;
    const events = (re['events'] as Rec[]).filter((e) => e['id'] !== 'radio_failure').map((e) => { if (e['id'] !== 'mine') return e; const { params: _p, ...rest } = e; return rest; });
    expect(sha({ ...re, events })).toBe('6570ba60a8b30c7c6546dea32f5f9478d379ed4820afd026797d541ad40d1103');
    const sc = gameData.scoring as unknown as { objective_by_type: Rec; kill: { points_by_enemy: Rec } };
    expect(Object.entries(sc.objective_by_type).filter(([k]) => k !== 'source')).toEqual([['intercept_destroyer', 300], ['barge_hunt', 300], ['escort_vip', 300], ['attack_and_survive', 300], ['patrol_and_evade', 300], ['escort_convoy', 300], ['evacuate_under_air_raid', 300], ['recon_and_attack', 300], ['rescue', 300]]);
    expect(sc.kill.points_by_enemy).toEqual({ daihatsu_barge: 75, ijn_transport: 400, us_pt_enemy: 140, ijn_battleship_fuso: 200, ijn_cruiser_mogami: 200, de_sboat_enemy: 70 });
    const rf = (re['events'] as Rec[]).find((e) => e['id'] === 'radio_failure')!;
    expect([rf['count'], rf['share'], rf['enemy_direct'], rf['game_event'], rf['version'], rf['label_ja']]).toEqual([0, 0, true, 'radio_failure', 'v0.8.2', '無線の故障（被弾で報告が送れない。中継の輪へ）']);
  });
});

describe('戦艦（扶桑型）と重巡（最上型）の記録（spec §4.3）', () => {
  it('鍵（ijn_destroyer の鍵に ship_class を足した形。戦艦は magazine も）・艦種・寸法・速さ・沈む本数', () => {
    expect(Object.keys(rec('ijn_battleship_fuso'))).toEqual([...KEYS.slice(0, 13), 'magazine', ...KEYS.slice(13)]);
    expect(Object.keys(rec('ijn_cruiser_mogami'))).toEqual(KEYS);
    const pick = (id: string): unknown[] => ['name_ja', 'ship_class', 'length_m', 'beam_m', 'speed_max_kt', 'speed_typical_kt', 'turn_rate_deg_s', 'accel_mps2', 'hull_hp', 'hull_circles', 'torpedo_hits_to_sink'].map((k) => rec(id)[k]);
    expect(pick('ijn_battleship_fuso')).toEqual(['戦艦（扶桑型）', 'battleship', 212.75, 33.1, 24.7, 18, 0.8, 0.15, 2000, 9, 6]);
    expect(pick('ijn_cruiser_mogami')).toEqual(['重巡洋艦（最上型）', 'heavy_cruiser', 200.6, 20.2, 35, 18, 1.2, 0.2, 1000, 8, 3]);
  });
  it('砲（主砲は置かない）・探照灯・星弾（戦艦は持たない）・見張り・回避・体当たりなし・端', () => {
    // 砲は v0.8.2 S3 の gunnery-sim で spec §4.3 の的（ijn_destroyer の HP/秒の戦艦 1.2〜1.6 倍・重巡 1.0〜1.3 倍、1,000・1,500・2,000 m）に合わせた値（戦艦 副砲 4 → 7 門・散布 220 → 185・高角砲 2 → 4、重巡 毎分 8 → 7・散布 170 → 125）
    expect((rec('ijn_battleship_fuso')['guns'] as Rec[]).map((g) => [g['id'], g['count'], g['effective_night_m'], g['rof_per_min'], g['damage'], g['shell_speed_mps'], g['dispersion_m'], g['splash_radius_m'], g['fire_chance'], g['engine_damage_chance']])).toEqual([
      ['sec_152mm', 7, 4500, 5, 40, 400, 185, 8, 0.4, 0.3], ['aa_127mm', 4, 3000, 8, 35, 400, 180, 8, 0.3, 0.2], ['aa_25mm', 8, 1200, 120, 4, 500, 70, 3, 0.05, 0.05],
    ]);
    expect((rec('ijn_cruiser_mogami')['guns'] as Rec[]).map((g) => [g['id'], g['count'], g['effective_night_m'], g['rof_per_min'], g['damage'], g['shell_speed_mps'], g['dispersion_m'], g['splash_radius_m'], g['fire_chance'], g['engine_damage_chance']])).toEqual([
      ['sec_127mm', 4, 3500, 7, 35, 400, 125, 8, 0.3, 0.25], ['aa_25mm', 8, 1200, 120, 4, 500, 70, 3, 0.05, 0.05],
    ]);
    // 25 mm は ijn_destroyer の aa_25mm の値で count だけ 8
    for (const id of ['ijn_battleship_fuso', 'ijn_cruiser_mogami']) expect({ ...gun(id, 'aa_25mm'), count: 4 }).toEqual(gun('ijn_destroyer', 'aa_25mm'));
    expect([rec('ijn_battleship_fuso')['searchlight'], rec('ijn_battleship_fuso')['starshell']]).toEqual([{ range_m: 4000, cone_deg: 12, sweep_deg_s: 15, on_delay_s: 3 }, null]);
    expect([rec('ijn_cruiser_mogami')['searchlight'], rec('ijn_cruiser_mogami')['starshell']]).toEqual([{ range_m: 3500, cone_deg: 12, sweep_deg_s: 20, on_delay_s: 2.5 }, { range_m: 7000, illum_radius_m: 1800, duration_s: 25, cooldown_s: 60 }]);
    expect((rec('ijn_cruiser_mogami')['starshell'] as Rec)).toEqual(rec('ijn_light_cruiser')['starshell']);
    expect([rec('ijn_battleship_fuso')['detection'], rec('ijn_cruiser_mogami')['detection']]).toEqual([
      { base_detect_m: 2600, reaction_delay_s: 1, torpedo_wake_detect_m: 2000, wake_spot_rate_per_s: 0.2 }, { base_detect_m: 2400, reaction_delay_s: 0.8, torpedo_wake_detect_m: 2000, wake_spot_rate_per_s: 0.2 },
    ]);
    expect([rec('ijn_battleship_fuso')['evasion'], rec('ijn_cruiser_mogami')['evasion']]).toEqual([
      { mode: 'comb_tracks', turn_toward_wakes: true, evade_turn_rate_deg_s: 1, speed_boost_kt: -4 }, { mode: 'comb_tracks', turn_toward_wakes: true, evade_turn_rate_deg_s: 1.5, speed_boost_kt: -6 },
    ]);
    for (const id of ['ijn_battleship_fuso', 'ijn_cruiser_mogami']) expect(rec(id)['ram']).toEqual({ enabled: false, trigger_m: 0, give_up_m: 0, stall_s: 0, cooldown_s: 0, turn_rate_bonus_deg_s: 0 });
    expect([(rec('ijn_battleship_fuso')['patrol'] as Rec)['edge_turn_margin_m'], (rec('ijn_cruiser_mogami')['patrol'] as Rec)['edge_turn_margin_m']]).toEqual([900, 800]);
  });
  it('AI と砲の記録として読める（getEnemyRecord・destroyerSetup）。端の向き直しは 18 kt の旋回半径 ＋ 縁の余白より大きい・当たりは見た目と同じ 2 倍（戦艦 425.5 m）', () => {
    const w = gameData.hitRateModel.world;
    for (const id of ['ijn_battleship_fuso', 'ijn_cruiser_mogami']) {
      const r = getEnemyRecord(gameData, id);
      const ai = shipAiParamsFromData(r);
      const ds = destroyerSetup(gameData, [], id, null, w.ship_hit_scale, false);
      expect(ds.gunnery).toEqual(gunneryParamsFromData(r));
      const turnRadius = ai.cruiseSpeedMps / ((ai.turnRateDegS * Math.PI) / 180);
      expect(turnRadius + (r.length_m * w.sprite_scale) / 2, id).toBeLessThan(ai.edgeTurnMarginM);
    }
    expect(destroyerSetup(gameData, [], 'ijn_battleship_fuso', null, 2, false).spec).toEqual({ lengthM: 212.75, beamM: 33.1, hullCircles: 9, hitsToSink: 6, hitScale: 2, boundsMarginM: 212.75 });
    expect(destroyerSetup(gameData, [], 'ijn_battleship_fuso', null, 2, false).gunnery.starshell).toEqual({ rangeM: 0, illumRadiusM: 0, durationS: 0, cooldownS: 0 }); // 星弾なし＝撃たない
  });
  it('出典: 寸法と兵装は historical（抜粋のみ）、強さと沈む本数は design。人名なし', () => {
    for (const id of ['ijn_battleship_fuso', 'ijn_cruiser_mogami']) {
      const src = rec(id)['source'] as Rec;
      expect(String(src['length_m・beam_m・speed_max_kt']), id).toMatch(/^historical \(/);
      expect(String(src['guns']), id).toMatch(/^historical \(.*\) \/ design \(v0\.8\.2 S0/);
      expect(String(src['torpedo_hits_to_sink']), id).toMatch(/^design \(v0\.8\.2 S0/);
    }
  });
});
