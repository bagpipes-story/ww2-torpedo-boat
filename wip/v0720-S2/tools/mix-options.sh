#!/bin/bash
# L23 の案の比べ: probe の記録（$PROBE）から 混む窓・静かな窓 ＋曲の束 を案ごとに作り、本物のリミッタに通す。案は 名前=環境変数 の並び
S=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S2
PROBE=${PROBE:-$S/probe-0.json}
cd /home/user/ww2-torpedo-boat
for spec in "$@"; do
  n=${spec%%=*}; envs=${spec#*=}
  rm -rf $S/mix/$n; mkdir -p $S/mix/$n
  env $envs PROBE=$PROBE RAW=1 MUSIC=1 node $S/tools/sfx-mix.mjs $S/mix/$n/raw > $S/mix/$n/mix.log 2>&1
  RAW=$S/mix/$n/raw JSON=$S/mix/$n/res.json node scripts/headless/sfx-offline.mjs > $S/mix/$n/offline.log 2>&1
  rm -rf $S/mix/$n/raw
  echo "== $n ($envs)"; grep -E "^(✓|✗)|^参考" $S/mix/$n/offline.log
done
