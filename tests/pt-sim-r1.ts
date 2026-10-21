// 実機 1 回目（f27b266）の米PT の模擬に戻す上書き（v0.6.3 実機 2 回目。spec r2 §I.3-5 の関門）: data の 6 つの値を前へ戻し（有効射程 400・待つ 500 m・位置取り 550 m・
// 次の航過まで 2.5 秒・機関損傷 0.02・T-14 の 13mm の散布 64）、航過は危ない間だけ（core/pt-fire）と追撃（core/pt-chase）を切る。scripts では
// PEFF=400 HOLD=500 STATION=550 GAP=2.5 PENG=0.02 GDISP=64 GR_OFF=1 CH_OFF=1（N 400 の表は v063r1/final/t1-400.txt・t2-400.txt と 1 字も違わない）。
// 実機 1 回目の帯（tests/pt-pass-sim*.test.ts・pt-gun-sim*.test.ts）はこれで回す（実機 2 回目の帯は追撃と一緒に入れる）。
import type { PtSimOverrides } from '../src/systems/pt-pass-sim-setup';

export const PT_SIM_R1: PtSimOverrides = { effectiveM: 400, holdOffM: 500, stationM: 550, passGapS: 2.5, engineDamage: 0.02, gunDisp: 64, passEndOff: true, chaseOff: true };
