#!/bin/bash
# IP2: ships と台本は IP1 の hull-probe と同じ（1 夜 1 本の扇）。TAG=before|after・SITE
D=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0820/ip2
cd /home/user/ww2-torpedo-boat
run(){ # mission hard targets
  local m=$1 h=$2 t=$3; local tag=$m$([ "$h" = 1 ] && echo h)
  SITE=$SITE MISSION=$m HARD=$([ "$h" = 1 ] && echo 1) SEEDS=1-8 RANGES=300,600,900,1400 SIDES=1,-1 TARGETS=$t JOBS=2 node $D/hull-probe.mjs > $D/$TAG-$tag.jsonl 2> $D/$TAG-$tag.err
}
run us_01 0 0; run us_01 1 0,1; run us_02 0 0,1; run us_02 1 0,1,2; run us_04 0 0,1,2,3; run us_04 1 0,1,2,3,4
run us_05 0 x; run us_06 0 0,1; run us_06 1 0,1,2,3; run jp_06 0 0; run jp_06 1 0,1
echo RUNS_DONE $TAG
