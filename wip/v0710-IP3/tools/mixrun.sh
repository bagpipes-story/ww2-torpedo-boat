#!/bin/bash
# mixrun.sh <name> <tune.mjs> [RATES]: S5 の t2 の probe（S5 の音量）を本物のリミッタに通す（busy・quiet・cue の窓）
IP=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0710/impl/IP2
S5=$IP/../S5
N=$1; T=$2; R=${3:-}
rm -rf $IP/mix/$N; mkdir -p $IP/mix/$N
END=${END:-} PROBE=$S5/t2/probe.json OUT=$IP/mix/$N/raw RATES="$R" GAINS="${GAINS:-}" node $T
cd /home/user/ww2-torpedo-boat && RAW=$IP/mix/$N/raw JSON=$IP/mix/$N/res.json node /tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0710/impl/IP2/tools/offline.mjs > $IP/mix/$N/offline.log
rm -rf $IP/mix/$N/raw
tail -1 $IP/mix/$N/offline.log
