// us_05 の再生と HUD の A/B の濾し（v0.8.2 S4。lead の L48。ab-replay.mjs と hud-ab.mjs の RECONUI=1）: A＝S3 の commit のビルド・B＝今の木で、HUD は S4 の新しい文と中継の端の印だけが違ってよい
// （世界の写し＝自艇・艦・魚雷・報告の段・見張り・弾薬庫・輝点・カメラは全部比べる）。v0.8.1 の anchor-filter.mjs（us_06）の写しに、印を消す 1 段を足した:
// - 両方の側で、中継の端の印の物（字の色が中継の輪の黄 #ffd84a の Text と、矢印の絵 tex-coast-marker の Image。us_05 の A には無い物＝B にだけ作る）を除く（緑の印など、ほかの物は残す）。
// - 出し側は B（新しい文を出す側）。B を先に回し、除いた後の HUD の物のうち下の lineRe に当たる Text（2 行目の報告の出来事 6 つ・常の文 4 つ・呼びかけの「報告済み ・ 帰投せよ」・
//   片道の列のレーダーの「接触が東（スリガオ海峡）へ消えた」）のフレームの番号と添字を記録し、両方の側でそのフレームのその Text だけを '<S4>' に替える。
// FILTERTEST=1 は濾しが別の変化を隠さない試し（A の、隠したフレームの隠していない Text の 1 つに 'X' を足す→違いが出るはず）。ページへは reconHud を toString で渡す。playwright を import しない。

/** 濾しの印（ページへは文字列で渡す）: 隠す Text の文の正規表現・除く物（中継の印の字の色と矢印の絵）・隠した物の字 */
export const RECON_FILTER = {
  lineRe: '^(戦艦を確認！ |報告を送った！ |無線が壊れた！ |報告を中継した！ |戦艦に命中！ |重巡に命中！ |弾薬庫が誘爆！ |報告: |無線故障 ・ |報告済み ・ |接触が東（スリガオ海峡）へ消えた$)',
  dropColor: '#ffd84a',
  dropTex: 'tex-coast-marker',
  mask: '<S4>',
};

/** ページの中: HUD の物を濾す（中継の印を除き、出し側は当たる Text を全部見つけて記録し、両方の側で記録した添字の Text を mask に替える）。f は o.s4、k はフレームの番号 */
export function reconHud(objs, f, k) {
  const out = objs.filter((x) => !(x.type === 'Text' && x.color === f.dropColor) && !(x.type === 'Image' && x.tex === f.dropTex));
  if (f.source) {
    const re = new RegExp(f.re);
    const at = [];
    out.forEach((x, i) => { if (x.type === 'Text' && re.test(x.text)) at.push(i); });
    if (at.length > 0) f.marks[k] = at;
  }
  const at = f.marks[k] ?? [];
  for (const i of at) if (out[i]) out[i] = { type: 'Text', text: f.mask };
  if (f.inject && at.length > 0) {
    const j = out.findIndex((x, n) => !at.includes(n) && x.type === 'Text' && /見つかる距離|夜明けまで/.test(x.text));
    if (j >= 0) out[j] = { ...out[j], text: `${out[j].text}X` };
  }
  return out;
}

/** 1 件を濾しつきで回す（B を先に。abRun はページの 1 夜の関数・o は abRun の引数）。戻りは [A, B] の結果、c.masked に隠したフレームの数 */
export async function reconPair(pa, pb, o, c, abRun) {
  for (const p of [pa, pb]) await p.page.evaluate(`window.__s4Hud = ${reconHud.toString()}`);
  const f = { ...RECON_FILTER, re: RECON_FILTER.lineRe };
  const rb = await pb.page.evaluate(abRun, { ...o, s4: { ...f, source: true, marks: {}, inject: false } });
  const ra = await pa.page.evaluate(abRun, { ...o, s4: { ...f, source: false, marks: rb.marks, inject: c.filtertest === true } });
  c.masked = Object.keys(rb.marks).length;
  return [ra, rb];
}
