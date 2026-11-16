#!/bin/bash
# 易しすぎだった時の直し方の候補を同じ探りで測る（lead の調べ。作業ブランチには入れない）。wt-S2（782bab2）の data の detect_factor だけを替えてビルドし、shore_east・open_north・shore_east_nb の 40 夜とハードの shore_east を回す。最後に data を戻す。
set -u
S=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad
W=$S/v0810/wt-S2; E=$S/v0810/explore
cd $W
for F in "$@"; do
  sed -i "908s/\"detect_factor\": [0-9.]*/\"detect_factor\": $F/" data/missions_seed.json
  sed -n '908p' data/missions_seed.json
  rm -rf $E/site-$F && VITE_BASE=/ww2-torpedo-boat/ VITE_BUILD_REF=main VITE_BUILD_SHA=e9d80ea npx vite build --outDir $E/site-$F > $E/build-$F.log 2>&1 || { echo build failed $F; git checkout data/missions_seed.json; exit 1; }
  SITE=$E/site-$F POLS=shore_east,open_north,shore_east_nb JOBS=1 EXT=0 node scripts/headless/anchor-probe.mjs > $E/normal-$F.txt 2>&1
  SITE=$E/site-$F HARD=1 POLS=shore_east JOBS=1 EXT=0 node scripts/headless/anchor-probe.mjs > $E/hard-$F.txt 2>&1
  git checkout -q data/missions_seed.json
  echo "== $F"; grep -v "seed " $E/normal-$F.txt $E/hard-$F.txt | grep -v "^\s*$"
done
git status --short | grep -v node_modules
