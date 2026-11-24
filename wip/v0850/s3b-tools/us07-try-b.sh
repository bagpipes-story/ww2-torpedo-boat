#!/bin/bash
# 変種を当てて build して帯を回す: us07-try.sh <name> <variant.json|-> [SCRIPTS] — data は元に戻さない（git checkout data/missions_seed.json で戻す）
set -e
SP=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0850
D=$SP/impl/v0850-s3b/try-$1; mkdir -p $D
cd /home/user/ww2-torpedo-boat
[ "$2" = - ] || node $SP/tools/us07-patch.mjs $2
git diff --stat data/ > $D/diffstat.txt
rm -rf $D/site; VITE_BASE=/ww2-torpedo-boat/ VITE_BUILD_REF=s3b VITE_BUILD_SHA=$1 npx vite build --outDir $D/site > $D/build.log 2>&1
SITE=$D/site SCRIPTS=${SCRIPTS:-careful,silent,straight} JOBS=${JOBS:-3} OUT=$D/band.json node $SP/tools/us07-band.mjs > $D/band.log 2>&1
grep -A20 '^| 台本' $D/band.log
