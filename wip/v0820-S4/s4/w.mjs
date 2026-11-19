const W = (s, px) => { let w = 0; for (const ch of s) w += (ch.charCodeAt(0) < 0x2000 ? 0.602 : 1) * px; return w; };
for (const a of process.argv.slice(2)) { const i = a.lastIndexOf('@'); const s = a.slice(0, i), px = Number(a.slice(i + 1)); console.log(W(s, px).toFixed(1), px, s); }
