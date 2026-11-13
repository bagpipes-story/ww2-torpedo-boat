import json,sys,math
a={(x['name'],x['tag']):x for x in json.load(open(sys.argv[1]))}
b={(x['name'],x['tag']):x for x in json.load(open(sys.argv[2]))}
f=lambda v: '  -  ' if v is None or v!=v else f"{v:5.1f}"
print(f"{'case':14s} {'tag':5s} peak     RMS dB         blast med      iso    eng%")
for k in sorted(a):
  x,y=a[k],b.get(k)
  if not y: continue
  print(f"{k[0]:14s} {k[1]:5s} {x['peak']:.2f}→{y['peak']:.2f} {20*math.log10(x['rms']):6.1f}→{20*math.log10(y['rms']):6.1f}  {f(x['blastMed'])}→{f(y['blastMed'])}  {f(y['isoMed'])}  {x['engineShare']*100:3.0f}→{y['engineShare']*100:3.0f}")
