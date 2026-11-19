#!/bin/bash
D=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0820/ip1
cd /home/user/ww2-torpedo-boat
S=$D/site-final
time (SITE=$S MISSION=us_05 SEEDS=1-24 node $D/hull-probe.mjs > $D/hp-us05.jsonl 2> $D/hp-us05.err)
SITE=$S MISSION=us_02 SEEDS=1-12 TARGETS=0,1 node $D/hull-probe.mjs > $D/hp-us02.jsonl 2> $D/hp-us02.err
SITE=$S MISSION=us_04 SEEDS=1-12 TARGETS=0,1,2,3,4 node $D/hull-probe.mjs > $D/hp-us04.jsonl 2> $D/hp-us04.err
echo HULL_DONE
