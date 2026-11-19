#!/bin/bash
D=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0820/ip1
cd /home/user/ww2-torpedo-boat
SITE=$D/site-e SEEDS=1-40 EXT=0 JOBS=2 POLS=shadow_report,report_attack,bb_ambush node scripts/headless/column-probe.mjs > $D/f540-normal.txt 2>&1
SITE=$D/site-e SEEDS=1-40 EXT=0 JOBS=2 HARD=1 POLS=shadow_report,report_attack node scripts/headless/column-probe.mjs > $D/f540-hard.txt 2>&1
for M in us_02 us_04; do T=0,1; [ $M = us_04 ] && T=0,1,2,3,4
  for I in 0 1; do SITE=$D/site-e MISSION=$M SEEDS=1-16 RANGES=400,700,1000,1500 SIDES=1,-1 TARGETS=$T INF=$I node $D/hull-probe.mjs > $D/inf-$M-$I.jsonl 2> $D/inf-$M-$I.err; done
done
echo E_DONE
