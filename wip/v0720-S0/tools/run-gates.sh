#!/usr/bin/env bash
# v0.7.2 の段の門をまとめて回す: run-gates.sh <stage>（例 S1）。結果は $D/SUMMARY.txt（1 門 1 行 ✓/✗）と各 log。最後に ALL_DONE。
# v0710/tools/run-gates.sh の写し（v0.7.2 S0）。変えた所: 基準は main 35e9e77（v0720/base-35e9e77。同じビルド番号 main@35e9e77 で今の木を作って比べる）・出力は v0720/impl/<stage>/。
# ほかは v0.7.1 のまま: 再生の A/B を音の 3 つの状態で回す（scripts/headless/lib.mjs の環境変数）:
#   default＝今までどおり（AudioContext は suspended）・audio＝AUDIO=1（autoplay を許す＝running）・noaudio＝NOAUDIO=1（AudioContext なし＝音のエンジンが無い）
# 環境変数:
#   AUDIO_STATES（既定 "default audio noaudio"）: ab-replay all 58 と hud-ab base 16 を回す状態
#   SMALL_AUDIO_STATES（既定 "default"）: 小さい組（ab-replay・hud-ab の jp04base 8・jp03 4）を回す状態
#   SKIP（既定 なし。空白区切り）: 飛ばす門 build typecheck lint test g2 ab hud tex-ab art-perf snapshots（build を飛ばすと $D/site をそのまま使う）
#   AB_ENV（既定 なし）: ab-replay・hud-ab だけに渡す環境変数（短い確かめ用。例 AB_ENV="MISSION=us_02 SECS=20"＝どの組も us_02 の 1 件 20 秒になる）
#   JOBS（既定 3）
# SUMMARY の名前: 既定の状態は ab-all・hud-base …、ほかの状態は @audio・@noaudio を付ける（log も同じ名前）。art-perf は参考（門ではない）。
# 既知の揺れ（v0.7.0 から）: ab-all の us_02 seed 1 の最後のフレーム → result の組を同じ状態で JOBS=1 で回し直す（下）。
# 時間の目安（v0.7.1 IP4・S5 の実測）: npm test 約 6 分・g2 約 20 分・ab-all は 1 状態 1〜2 分・hud-base と小さい組は 1 分以内・tex-ab 約 1 分＝art-perf なしで約 35〜40 分、art-perf は ＋約 14 分。
set -u
STAGE=${1:?stage}
cd /home/user/ww2-torpedo-boat
SP=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad
D=$SP/v0720/impl/$STAGE; mkdir -p $D
A=$SP/v0720/base-35e9e77; B=$D/site
AUDIO_STATES=${AUDIO_STATES:-"default audio noaudio"}
SMALL_AUDIO_STATES=${SMALL_AUDIO_STATES:-"default"}
SKIP=" ${SKIP:-} "
AB_ENV=${AB_ENV:-}
JOBS=${JOBS:-3}
SUM=$D/SUMMARY.txt; : > $SUM
ok(){ echo "✓ $1" >> $SUM; }; ng(){ echo "✗ $1" >> $SUM; }
skip(){ case "$SKIP" in *" $1 "*) echo "- $1 (SKIP)" >> $SUM; return 0;; esac; return 1; }
[ -d $A/assets ] || { ng "base site $A が無い（v0720/wt-35e9e77 で VITE_BASE=/ww2-torpedo-boat/ VITE_BUILD_REF=main VITE_BUILD_SHA=35e9e77 npx vite build --outDir $A）"; echo ALL_DONE >> $SUM; echo ALL_DONE; exit 1; }
skip build || { rm -rf $B && VITE_BASE=/ww2-torpedo-boat/ VITE_BUILD_REF=main VITE_BUILD_SHA=35e9e77 npx vite build --outDir $B > $D/build.log 2>&1 && ok build || ng build; }
skip typecheck || { npm run typecheck > $D/typecheck.log 2>&1 && ok typecheck || ng typecheck; }
skip lint || { npm run lint > $D/lint.log 2>&1 && ok lint || ng lint; }
skip test || { npm test > $D/test.log 2>&1 && ok "npm test $(grep -E 'Tests +[0-9]+ passed' $D/test.log | tail -1 | tr -s ' ')" || ng "npm test (see test.log)"; }
skip g2 || { G6=1 ALLY=1 EVAC=1 OUTDIR=$D/g2 bash scripts/headless/g2.sh > $D/g2.log 2>&1 && ok "g2 $(grep -o 'OK [0-9]* DIFF [0-9]*' $D/g2.log | tail -1)" || ng "g2 $(grep -o 'OK [0-9]* DIFF [0-9]*' $D/g2.log | tail -1)"; }
# 音の状態 → lib.mjs の環境変数
state_env(){ case "$1" in default) echo "";; audio) echo "AUDIO=1";; noaudio) echo "NOAUDIO=1";; *) echo "BAD_STATE=$1";; esac; }
abrun(){ # name tool set cam state
  local n=$1 t=$2 s=$3 c=$4 st=$5
  [ "$st" = default ] || n="$n@$st"
  env $(state_env $st) $AB_ENV A=$A B=$B SET=$s CAM=$c JOBS=$JOBS node scripts/headless/$t.mjs > $D/$n.log 2>&1
  local line; line=$(grep -E '^cases' $D/$n.log | tail -1)
  if echo "$line" | grep -q 'diff 0'; then ok "$n $line"; else ng "$n $line"; fi
}
if ! skip ab; then
  for st in $AUDIO_STATES; do abrun ab-all ab-replay all 1 $st; done
  for st in $SMALL_AUDIO_STATES; do abrun ab-jp04base ab-replay jp04base 1 $st; abrun ab-jp03 ab-replay jp03 1 $st; done
fi
if ! skip hud; then
  for st in $AUDIO_STATES; do abrun hud-base hud-ab base 0 $st; done
  for st in $SMALL_AUDIO_STATES; do abrun hud-jp04base hud-ab jp04base 0 $st; abrun hud-jp03 hud-ab jp03 0 $st; done
fi
# 既知の揺れ（v0.7.0 から）: nodawn/result の us_02 seed 1 の最後のフレームの .t。ab-all（どの状態でも）が ✗ なら result の組を同じ状態で 1 本ずつ回し直す
for st in $AUDIO_STATES; do
  n=ab-all; [ "$st" = default ] || n="ab-all@$st"
  if grep -q "^✗ $n " $SUM; then
    env $(state_env $st) $AB_ENV A=$A B=$B SET=result CAM=1 JOBS=1 node scripts/headless/ab-replay.mjs > $D/ab-rerun${st:+@$st}.log 2>&1
    grep -E '^cases' $D/ab-rerun@$st.log | tail -1 | grep -q 'diff 0' && ok "$n rerun of the flaky set (result, JOBS=1): $(grep -E '^cases' $D/ab-rerun@$st.log | tail -1)" || ng "$n rerun still differs (see ab-rerun@$st.log)"
  fi
done
skip tex-ab || { A=$A B=$B CHECK=1 JOBS=$JOBS OUT=$D/tex-ab.json node scripts/headless/tex-ab.mjs > $D/tex-ab.log 2>&1 && ok "tex-ab CHECK=1 $(grep -c '✗' $D/tex-ab.log) ✗ lines" || ng "tex-ab (see tex-ab.log)"; }
skip art-perf || { A=$A B=$B ROUNDS=2 OUT=$D/art-perf.json node scripts/headless/art-perf.mjs > $D/art-perf.log 2>&1 && ok "art-perf(参考) $(tail -1 $D/art-perf.log | cut -c1-80)" || ng "art-perf(参考。門ではない) $(tail -1 $D/art-perf.log | cut -c1-120)"; }
skip snapshots || { git -C /home/user/ww2-torpedo-boat diff --quiet HEAD -- tests/__snapshots__ 2>/dev/null && ok "snapshots untouched" || ng "snapshots changed"; }
echo ALL_DONE >> $SUM; echo ALL_DONE
