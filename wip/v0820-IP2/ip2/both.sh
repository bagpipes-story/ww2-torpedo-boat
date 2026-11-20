#!/bin/bash
D=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0820
TAG=before SITE=$D/site-IP1-e6fab9d $D/ip2/runs.sh
TAG=after SITE=$D/ip2/site-after $D/ip2/runs.sh
echo BOTH_DONE
