// IP4: 一斉発射の窓の音の元（F＝今のゲームの torp_launch・A＝IP2〜IP3 の既定）を f32 で書く（salvo-offline.mjs が読む）
import { writeFileSync } from 'node:fs';
import { renderSfx } from '/home/user/ww2-torpedo-boat/src/assets/sfx-bank';
import { SFX_VARIANT_GROUPS, renderSfxVariant } from '/home/user/ww2-torpedo-boat/src/assets/sfx-variants';
import { SFX_TABLE } from '/home/user/ww2-torpedo-boat/src/config/sfx-config';
const out = process.env.OUT!;
const g = SFX_VARIANT_GROUPS[2]!;
writeFileSync(`${out}/F.f32`, Buffer.from(renderSfx('torp_launch').buffer));
writeFileSync(`${out}/A.f32`, Buffer.from(renderSfxVariant(g.variants[0]!).buffer));
writeFileSync(`${out}/meta.json`, JSON.stringify({ gain: SFX_TABLE.torp_launch.gain, sr: 22050 }));
