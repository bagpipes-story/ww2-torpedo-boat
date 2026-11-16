// v0.8.0 S1: 純粋な規則の core（core/radar・core/ship-transit・core/strait-geometry）の source の走査（tests/sfx-rules の「毎フレームの口の本体に確保なし」と同じやり方を、
// 名前の一覧で全部の関数に）。コメントを除いた source（sfx-rules-kit の code）から function の本体を名前ごとに取り出し、作る関数（起動時に 1 回）を除く全部の本体に
// 確保の形（new・配列やオブジェクトのリテラル・map/filter など・矢印関数・テンプレート文字列・展開・Array/Object/JSON）が無いことを見る。
import { code, imports } from './sfx-rules-kit';

export { code, imports };

/** function の名前 → 本体（引数のかっこを数えてから、本体の中かっこを数えて取り出す。戻りの型に中かっこを書かない関数だけ＝この 3 本はそう） */
export function functionBodies(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /\bfunction\s+(\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = re.lastIndex;
    for (let depth = 1; i < src.length && depth > 0; i++) depth += src[i] === '(' ? 1 : src[i] === ')' ? -1 : 0;
    const open = src.indexOf('{', i);
    let j = open + 1;
    for (let depth = 1; j < src.length && depth > 0; j++) depth += src[j] === '{' ? 1 : src[j] === '}' ? -1 : 0;
    out.set(m[1]!, src.slice(open + 1, j - 1));
  }
  return out;
}

/** 確保の形（毎ステップの本体に出てはいけない） */
export const ALLOC_PATTERNS: readonly RegExp[] = [
  /\bnew\s/,
  /\.(map|filter|slice|concat|push|splice|sort|reduce|forEach|fill|flatMap|join|split)\(/,
  /\{\s*\w+\s*:/,
  /=>/,
  /`/,
  /\.\.\./,
  /(?:[=(,:?]|\breturn)\s*\[/,
  /\b(Array|Object|JSON|Map|Set|String)\s*[.(]/,
];

/** 本体に出た確保の形（無ければ空） */
export function allocationsIn(body: string): string[] {
  return ALLOC_PATTERNS.filter((re) => re.test(body)).map((re) => String(re));
}

/** file の関数を走査: 名前の全部（作る関数 setup とそれ以外）を返し、setup 以外の本体の確保の形を [名前, 形] の組で返す */
export function scanAllocations(file: string, setup: readonly string[]): { names: string[]; bad: [string, string][] } {
  const bodies = functionBodies(code(file));
  const bad: [string, string][] = [];
  for (const [name, body] of bodies) if (!setup.includes(name)) for (const a of allocationsIn(body)) bad.push([name, a]);
  return { names: [...bodies.keys()].sort(), bad };
}
