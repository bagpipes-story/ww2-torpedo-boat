#!/bin/bash
D=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0820/ip1
cd /home/user/ww2-torpedo-boat
SITE=$D/site-fix MISSION=us_05 SEEDS=1-24 node $D/hull-probe.mjs > $D/hpfix-us05.jsonl 2> $D/hpfix-us05.err
SITE=$D/site-fix SEEDS=1-40 EXT=0 JOBS=2 POLS=shadow_report,report_attack,bb_ambush node scripts/headless/column-probe.mjs > $D/fix-normal.txt 2>&1
SITE=$D/site-fix SEEDS=1-40 EXT=0 JOBS=2 HARD=1 POLS=shadow_report,report_attack node scripts/headless/column-probe.mjs > $D/fix-hard.txt 2>&1
echo FIX_DONE
