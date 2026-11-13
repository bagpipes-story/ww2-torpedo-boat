import json,sys,statistics as st
def load(p): return json.load(open(p))
def summ(name,r):
  pk=max(x['peak'] for x in r); ov=max(x['over'] for x in r)
  out=[f"{name}: peak {pk:.3f} over {ov*100:.3f}%"]
  for tags in (('busy',),('cue',),('busy','cue','quiet')):
    for k in ('torp_launch','reload','reload_end'):
      pops=[]; snr=[]
      for x in r:
        if x['tag'] in tags:
          pops+=x['cue'].get(k,[]); snr+=x['snr'].get(k,[])
      if pops: out.append(f"  {'+'.join(tags):15s} {k:11s} n {len(pops):3d} pop med {st.median(pops):5.1f} min {min(pops):5.1f} | snr med {st.median(snr):5.1f} min {min(snr):5.1f}")
  cw=[x for x in r if x['tag']=='cue']
  out.append(f"  cue windows {len(cw)}: peak max {max(x['peak'] for x in cw):.3f}  RMS med {st.median(x['rms'] for x in cw):.4f}")
  return out
for n,p in zip(sys.argv[2::2],sys.argv[1::2]): print("\n".join(summ(n,load(p))))
