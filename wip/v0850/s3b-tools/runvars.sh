#!/bin/bash
# 変種を順に: runvars.sh name... （各 var/<name>.json。S3 の data から当てる）
SP=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0850
for n in "$@"; do
  cp $SP/impl/v0850-s3b/ms-s3.json /home/user/ww2-torpedo-boat/data/missions_seed.json
  SEEDS=${SEEDS:-1-32} SCRIPTS=${SCRIPTS:-careful} JOBS=${JOBS:-4} bash $SP/tools/us07-try-b.sh $n $SP/impl/v0850-s3b/var/$n.json > $SP/impl/v0850-s3b/try-$n.out 2>&1
  echo "done $n"
done
cp $SP/impl/v0850-s3b/ms-s3.json /home/user/ww2-torpedo-boat/data/missions_seed.json
echo ALLDONE
