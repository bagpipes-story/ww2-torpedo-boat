#!/bin/bash
# exp.sh <name> "<GAINS>" "<LOOPS>" [offline env...]: base の probe に音量の倍率を掛けて本物のリミッタで数える（混む窓だけを 1 行ずつ要約）
S5=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0710/impl/S5
N=$1; G=$2; L=$3; shift 3
P=${PROBE:-$S5/base/probe.json}
BUSY=${CASES:-jp_03h,jp_03h-last,jp_04h-busy,jp_05-hot,jp_06h,us_02-storm,us_02h-busy,us_03-burst,us_02,jp_04h,us_01h,jp_01h}
rm -rf $S5/exp/$N; mkdir -p $S5/exp/$N
PROBE=$P OUT=$S5/exp/$N/raw CASES=$BUSY GAINS="$G" LOOPS="$L" MININT="${MININT:-}" node $S5/tools/tune.mjs
env "$@" RAW=$S5/exp/$N/raw JSON=$S5/exp/$N/res.json node $S5/tools/offline.mjs > $S5/exp/$N/offline.log
rm -rf $S5/exp/$N/raw
python3 - $S5/exp/$N/res.json "$N" <<'PY'
import json,sys,statistics as st
r=json.load(open(sys.argv[1]))
b=[x for x in r if x['tag']=='busy']; q=[x for x in r if x['tag']=='quiet']
pk=max(x['peak'] for x in r); ov=max(x['over'] for x in r)
bm=[x['blastMed'] for x in b if x['nBlast']>0]
low=[f"{x['name']}:{x['blastMed']:.1f}" for x in b if x['nBlast']>0 and x['blastMed']<6]
iso=[f"{x['name']}:{x['isoMed']:.1f}({x['nIso']})" for x in b if x['nIso']>0 and x['isoMed']<6]
im=[x['isoMed'] for x in b if x['nIso']>0]
cues={}
for x in b:
  for k,v in x['cue'].items(): cues.setdefault(k,[]).extend(v)
ct=" ".join(f"{k}:{st.median(v):.1f}/{min(v):.1f}" for k,v in sorted(cues.items()))
print(f"{sys.argv[2]:10s} peak {pk:.3f} over {ov*100:.2f}% | blast med min {min(bm):.1f} median-of-med {st.median(bm):.1f} <6: {' '.join(low)} | iso min {min(im):.1f} <6: {' '.join(iso)} | eng busy {st.median([x['engineShare'] for x in b])*100:.0f}% quiet {st.median([x['engineShare'] for x in q])*100:.0f}%")
print(f"{'':10s} cues {ct}")
sn={}
for x in b:
  for k,v in x['snr'].items(): sn.setdefault(k,[]).extend(v)
print(f"{'':10s} snr  "+" ".join(f"{k}:{st.median(v):.1f}/{min(v):.1f}" for k,v in sorted(sn.items())))

PY
