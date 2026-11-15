# v0.8.0 S1: 1 つずつわざと壊して、新しい tests が落ちるかを見る（終われば必ず元に戻す）
import subprocess, sys, shutil
R='/home/user/ww2-torpedo-boat'
TESTS=['tests/strait-geometry.test.ts','tests/ship-transit.test.ts','tests/radar.test.ts','tests/radar-night.test.ts']
M=[
 ('src/core/ship-transit.ts','s.feelS < transitEnterAtS(p, i)','nowS < transitEnterAtS(p, i)','entry on the fixed-step clock'),
 ('src/core/ship-transit.ts','nowS < s.awayAtS[i]! + p.unloadS','s.feelS < s.awayAtS[i]! + p.unloadS','unload on the feel clock'),
 ('src/core/ship-transit.ts','if (s.dawn || nowS < s.awayAtS','if (nowS < s.awayAtS','AWAY returns after dawn'),
 ('src/core/ship-transit.ts','if (s.dawn || s.feelS <','if (s.feelS <','WAIT enters after dawn'),
 ('src/core/ship-transit.ts','      if (v.sinking) {','      if (false) {','sinking ignored'),
 ('src/core/ship-transit.ts','} else if (pastLanding || pastOrigin) {','} else if (pastLanding) {','back edge not gone'),
 ('src/core/ship-transit.ts','s.coverLeaves = p.coverLeavesWithOutbound;','s.coverLeaves = true;','cover flag ignores plan'),
 ('src/core/ship-transit.ts','  s.coverLeaves = false;\n','','cover flag not reset'),
 ('src/core/radar.ts','> (kind === RADAR_KIND_SMALL ? p.smallRange2 : p.shipRange2)','>= (kind === RADAR_KIND_SMALL ? p.smallRange2 : p.shipRange2)','range exclusive'),
 ('src/core/radar.ts','kind === RADAR_KIND_SMALL ? p.smallRange2','kind === RADAR_KIND_AIR ? p.smallRange2','small uses ship range'),
 ('src/core/radar.ts','landDist2(geo.land, x, y) < clutter2','landDist2(geo.land, x, y) <= clutter2','clutter inclusive'),
 ('src/core/radar.ts','(kind === RADAR_KIND_AIR && !p.aircraft)','(kind === RADAR_KIND_AIR && p.aircraft)','aircraft shown'),
 ('src/core/radar.ts','if (b[k]!.x === x && b[k]!.y === y) return;','if (false) return;','no merge'),
 ('src/core/radar.ts','Math.round(x / step) * step','Math.floor(x / step) * step','floor rounding'),
 ('src/core/radar.ts','if (t.afloat[i] !== 1 ||','if (','sinking shown'),
 ('src/core/radar.ts','  const b = s.blips;\n  for (let k = 0; k < s.n; k++) {\n    s.prevX','  const b = s.blips;\n  const junk = [1];\n  for (let k = 0; k < s.n; k++) {\n    s.prevX','allocation in stepRadar'),
 ('src/core/radar.ts','for (; k > 0 && s.d2[k - 1]! > d2; k--) {','for (; false; k--) {','unsorted'),
 ('src/core/radar.ts','s.nextSweepS = (Math.floor((nowS + RADAR_TIME_EPS_S) / p.sweepS) + 1) * p.sweepS;','s.nextSweepS = nowS + p.sweepS;','sweep phase drifts'),
 ('src/core/radar.ts','if (m > bestD2) {\n      bestD2 = m;\n      best = k;','if (m < bestD2) {\n      bestD2 = m;\n      best = k;','newest picks wrong'),
 ('src/core/strait-geometry.ts','const dx = x < s.x0 ? s.x0 - x : x > s.x1 ? x - s.x1 : 0;','const dx = 0;','gaps ignored'),
 ('src/core/strait-geometry.ts','return dot > 0 && dot * dot >= cos2 * d2;','return dot * dot >= cos2 * d2;','behind is risk'),
 ('src/core/strait-geometry.ts','const dot = Math.sin(h) * dx - Math.cos(h) * dy;','const dot = Math.sin(h) * dx + Math.cos(h) * dy;','heading y sign'),
]
only = sys.argv[1:] 
res=[]
for i,(f,a,b,name) in enumerate(M):
    if only and str(i) not in only: continue
    p=f'{R}/{f}'; orig=open(p,encoding='utf8').read()
    if orig.count(a)!=1: res.append((name,'PATTERN x%d'%orig.count(a))); continue
    try:
        open(p,'w',encoding='utf8').write(orig.replace(a,b))
        r=subprocess.run(['npx','vitest','run',*TESTS],cwd=R,capture_output=True,text=True,timeout=300)
        out=r.stdout+r.stderr
        fails=[l.strip() for l in out.splitlines() if l.strip().startswith('×')]
        res.append((name,'caught' if r.returncode!=0 else 'MISSED', len(fails)))
    finally:
        open(p,'w',encoding='utf8').write(orig)
for x in res: print(x)
