#!/bin/bash
S5=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0710/impl/S5
cd /home/user/ww2-torpedo-boat
run(){ local n=$1; shift; echo "=== $n ($*)"; env "$@" SITE=$S5/site node scripts/headless/sfx-live.mjs > $S5/live-$n.log 2>&1; echo "exit $? ✓$(grep -c '✓' $S5/live-$n.log) ✗$(grep -c '✗' $S5/live-$n.log)"; }
run title-default FLOW=title
run title-audio FLOW=title AUDIO=1
run direct-default FLOW=direct
run direct-audio FLOW=direct AUDIO=1
run direct-noaudio FLOW=direct NOAUDIO=1
run direct-us03 FLOW=direct AUDIO=1 MISSION=us_03 Q=barges=near MUZZLE=0
