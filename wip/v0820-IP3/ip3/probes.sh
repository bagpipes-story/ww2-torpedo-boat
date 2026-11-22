#!/bin/bash
D=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0820/ip3
cd /home/user/ww2-torpedo-boat
SITE=$D/site SEEDS=1-40 EXT=0 JOBS=2 POLS=shadow_report,report_attack,bb_ambush node scripts/headless/column-probe.mjs > $D/final-normal.txt 2>&1
SITE=$D/site SEEDS=1-40 EXT=0 JOBS=2 HARD=1 POLS=shadow_report,report_attack node scripts/headless/column-probe.mjs > $D/final-hard.txt 2>&1
FORCE_RADIO=1 SITE=$D/site SEEDS=1-12 EXT=0 JOBS=2 POLS=shadow_report,report_attack node $D/relay-probe.mjs > $D/relay-normal.txt 2>&1
FORCE_RADIO=1 SITE=$D/site SEEDS=1-12 EXT=0 JOBS=2 HARD=1 POLS=shadow_report node $D/relay-probe.mjs > $D/relay-hard.txt 2>&1
echo PROBES_DONE
