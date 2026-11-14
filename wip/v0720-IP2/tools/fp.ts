// 鍵ごとの 16 bit の指紋（tests/sfx-music-render と同じ FNV-1a）と長さ・音量の案
import { MUSIC_KEYS, MUSIC_WORK_SAMPLES } from '@repo/src/config/sfx-music-config';
import { renderMusic } from '@repo/src/assets/sfx-music-render';
import { MusicTables } from '@repo/src/assets/sfx-music-synth';
function fingerprint16(x: Float32Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < x.length; i++) { const v = Math.round(x[i]! * 32767) & 0xffff; h = Math.imul(h ^ (v & 0xff), 0x01000193) >>> 0; h = Math.imul(h ^ (v >>> 8), 0x01000193) >>> 0; }
  return h;
}
const tb = new MusicTables(), w = new Float32Array(MUSIC_WORK_SAMPLES);
console.log(MUSIC_KEYS.map((k) => `${k}: ${fingerprint16(renderMusic(k, 150000, tb, w))}`).join(', '));
