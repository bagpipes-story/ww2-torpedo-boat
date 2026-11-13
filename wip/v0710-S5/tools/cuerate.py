import json,sys,collections
d=json.load(open(sys.argv[1]))
keys=sys.argv[2].split(',') if len(sys.argv)>2 else ['hull_hit','engine_cough','alarm','bomb_fall','light_on','reload','torp_launch','bell','splash_l','mg']
for c in d['cases']:
  out=[]
  for k in keys:
    ts=[r[0] for r in c['log'] if r[1]==k and r[6]>=0]
    if not ts: continue
    # max count in any 20 s window
    m20=max(sum(1 for u in ts if t<=u<t+20) for t in ts)
    gaps=sorted(b-a for a,b in zip(ts,ts[1:]))
    med=gaps[len(gaps)//2] if gaps else 0
    out.append(f"{k} {len(ts)} (20s max {m20}, med gap {med:.2f})")
  print(f"{c['name']:13s} {c['t1']-c['t0']:5.0f}s  "+"  ".join(out))
