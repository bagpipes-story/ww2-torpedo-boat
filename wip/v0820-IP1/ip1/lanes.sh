#!/bin/bash
# IP1 Task A: 時雨の道 −560/−540/−530/−520 の探り（ノーマル 3 台本 × 40 夜・ハード shadow_report 40 夜。EXT=0）
D=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0820/ip1
cd /home/user/ww2-torpedo-boat
for L in ${LANES:-560 530 540 520}; do
  SITE=$D/site-L$L SEEDS=1-40 EXT=0 JOBS=2 POLS=shadow_report,report_attack,bb_ambush node scripts/headless/column-probe.mjs > $D/L$L-normal.txt 2>&1
  SITE=$D/site-L$L SEEDS=1-40 EXT=0 JOBS=2 HARD=1 POLS=shadow_report node scripts/headless/column-probe.mjs > $D/L$L-hard.txt 2>&1
done
echo LANES_DONE
