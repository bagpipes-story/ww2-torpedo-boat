#!/bin/bash
# heap の後に順に: Boot の create・最初のタップ（1.2 秒・5 秒）・npm test（時間を測る道具は重ねない）
F=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/tasks/b11awpf55.output
until grep -q "heap s2 exit" $F; do sleep 5; done
echo "heap done $(date +%T)"
if pgrep -f run-gates.sh >/dev/null; then echo "lead run-gates is running: waiting"; while pgrep -f run-gates.sh >/dev/null; do sleep 15; done; fi
cd /home/user/ww2-torpedo-boat
A=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/base-35e9e77 B=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S2/site N=15 ROUNDS=3 timeout 1500 node /tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S1/tools/boot-time.mjs > /tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S2/boot-time.txt 2>&1; echo "boot exit $? $(date +%T)"
A=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/base-35e9e77 B=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S2/site N=9 AT=1200 timeout 900 node /tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S1/tools/first-tap.mjs > /tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S2/first-tap.txt 2>&1; echo "tap1200 exit $? $(date +%T)"
A=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/base-35e9e77 B=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S2/site N=9 AT=5000 timeout 900 node /tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S1/tools/first-tap.mjs >> /tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S2/first-tap.txt 2>&1; echo "tap5000 exit $? $(date +%T)"
npm test > /tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S2/test-final.log 2>&1; echo "test exit $? $(date +%T)"
echo "after-heap all done"
