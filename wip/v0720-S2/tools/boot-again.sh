#!/bin/bash
# npm test の後に Boot の create をもう 2 回（S1 の site と S2・基準と S2）。ほかの重い仕事と重ねない
F=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/tasks/bsm0l4ep5.output
until grep -q "after-heap all done" $F; do sleep 5; done
while pgrep -f run-gates.sh >/dev/null; do sleep 15; done
cd /home/user/ww2-torpedo-boat
A=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S1/site B=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S2/site N=15 ROUNDS=3 timeout 1500 node /tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S1/tools/boot-time.mjs > /tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S2/boot-time-s1-s2.txt 2>&1; echo "boot s1-s2 exit $? $(date +%T)"
A=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/base-35e9e77 B=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S2/site N=15 ROUNDS=3 timeout 1500 node /tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S1/tools/boot-time.mjs > /tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S2/boot-time-2.txt 2>&1; echo "boot base-s2 again exit $? $(date +%T)"
echo "boot-again done"
