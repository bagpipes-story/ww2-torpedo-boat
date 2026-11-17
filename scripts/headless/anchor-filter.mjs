// us_06 の再生と HUD の A/B の濾し（v0.8.1 S4。lead の L69。ab-replay.mjs と hud-ab.mjs の ANCHORUI=1）: A＝S3 の commit のビルド・B＝今の木で、HUD は S4 の新しい文だけが違ってよい。
// 出し側は B（新しい文を出す側）。B を先に回し、HUD の物のうち下の lineRe に当たる Text（2 行目の「暗い岸を背にした」「停泊していた艦が動き出した！」・ハードの「衝突の危険！ 駆潜艇」、
// 夜明けの帯の「輸送船は泊地に残る」）のフレームの番号と添字（1 フレームに幾つでも）を記録し、両方の側でそのフレームのその Text だけを '<S4>' に替える。世界の写し（自艇・艦・魚雷・
// 止まった艦の段・輝点）とほかの HUD の物（緑の端の印も）はそのまま比べる。FILTERTEST=1 は濾しが別の変化を隠さない試し（A の、隠したフレームの隠していない Text の 1 つに 'X' を足す
// → 違いが出るはず）。v0.8.0 S4 の S4_FILTER（us_04）とは別の関数（あちらは 1 フレームに 1 つ・緑の印を除く＝tests/hud-ab-filter が固定）。tests/anchor-ab-filter が固定。
// ページへは anchorHud を toString で渡す（ab-replay の abRun の window.__s4Hud）。playwright を import しない（tests が source から読める）。
// v0.8.1 IP1（A＝S4 の commit のビルド）: 印に IP1 の 2 行目の 2 つ（「岸の陰に入った ・ 見つかる距離」＝「暗い岸を背にした」の言い換え・寄り方の手がかり「停泊艦の南の暗い海（岸の陰）から寄れ」）を足した
// （S4 の印は残す＝A が S3 のビルドでも同じ濾し）。岸の陰の絵（暗い陸・岸の陰の海）は Mission の場面の物で、HUD の写しにも世界の写しにも入らない（濾さない）。

/** 濾しの印（ページへは文字列で渡す）: 隠す Text の文の正規表現・隠した物の字 */
export const ANCHOR_FILTER = {
  lineRe: '^(暗い岸を背にした ・ 見つかる距離 |岸の陰に入った ・ 見つかる距離 |停泊艦の南の暗い海（岸の陰）から寄れ ・ 見つかりにくい$|停泊していた艦が動き出した！|衝突の危険！ 駆潜艇 )|輸送船は泊地に残る',
  mask: '<S4>',
};

/** ページの中: HUD の物を濾す（出し側は当たる Text を全部見つけて記録し、両方の側で記録した添字の Text を mask に替える）。f は o.s4、k はフレームの番号 */
export function anchorHud(objs, f, k) {
  const out = objs.slice();
  if (f.source) {
    const re = new RegExp(f.re);
    const at = [];
    out.forEach((x, i) => { if (x.type === 'Text' && re.test(x.text)) at.push(i); });
    if (at.length > 0) f.marks[k] = at;
  }
  const at = f.marks[k] ?? [];
  for (const i of at) if (out[i]) out[i] = { type: 'Text', text: f.mask };
  if (f.inject && at.length > 0) {
    const j = out.findIndex((x, n) => !at.includes(n) && x.type === 'Text' && /見つかる距離|健在|撃沈|帰投/.test(x.text));
    if (j >= 0) out[j] = { ...out[j], text: `${out[j].text}X` };
  }
  return out;
}

/** 1 件を濾しつきで回す（B を先に。abRun はページの 1 夜の関数・o は abRun の引数）。戻りは [A, B] の結果、c.masked に隠したフレームの数 */
export async function anchorPair(pa, pb, o, c, abRun) {
  for (const p of [pa, pb]) await p.page.evaluate(`window.__s4Hud = ${anchorHud.toString()}`);
  const f = { ...ANCHOR_FILTER, re: ANCHOR_FILTER.lineRe };
  const rb = await pb.page.evaluate(abRun, { ...o, s4: { ...f, source: true, marks: {}, inject: false } });
  const ra = await pa.page.evaluate(abRun, { ...o, s4: { ...f, source: false, marks: rb.marks, inject: c.filtertest === true } });
  c.masked = Object.keys(rb.marks).length;
  return [ra, rb];
}
