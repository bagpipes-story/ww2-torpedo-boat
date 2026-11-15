// v0.7.2 S1: 音のファイルの作法のテスト（tests/sfx-rules・sfx-rules-music）が共有する取り出し（tests/sfx-rules の頭から分けた。中身は v0.7.1 と同じ）。
// 対象の一覧（src の .ts・sfx-*・純粋な層・再生の層）と、コメントを除いた source・import の先・毎フレームの口の本体の取り出し。
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

export function allTs(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts')).map((f) => join(dir, f).split('\\').join('/')).sort();
}
export const SRC = allTs('src');
export const SFX = SRC.filter((f) => basename(f).startsWith('sfx-'));
/** 純粋な層（node で回る）: config・assets・core */
export const PURE = SFX.filter((f) => /^src\/(config|assets|core)\//.test(f));

/** コメント（// と /* *\/）を除いた source */
export function code(file: string): string {
  return strip(readFileSync(file, 'utf8'));
}
export function strip(src: string): string {
  // 左から順に、先に始まった方の注釈を消す（S1: 行の注釈の中の「data/*.json」を塊の注釈の始まりと読んで、boot-scene の import まで消していた）
  return src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
}
/** import・export from の先（相対の道の最後の名前。拡張子なし） */
export function imports(src: string): string[] {
  return [...src.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}
/** 毎フレーム・1 発ごとに通る口の本体（中かっこを数えて取り出す） */
export function hotBodies(src: string): string[] {
  const out: string[] = [];
  const re = /\b((?:update|step|tick|play|emit|cue|alloc|accept|drop|sfxAt|sfxGunAt|sfxUi|sfxCue|sfxLoop)\w*)\s*\([^)]*\)\s*(?::\s*[\w<>[\]|. ]+)?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    out.push(src.slice(re.lastIndex, i - 1));
  }
  return out;
}

/** 再生の層（v0.7.1 S1 から）: DOM に触ってよいのは sfx-boot だけ */
export const PLAYBACK = SFX.filter((f) => /^src\/systems\//.test(f));
