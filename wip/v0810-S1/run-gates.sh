#!/usr/bin/env bash
# v0.8.1 の段の門をまとめて回す: run-gates.sh <stage>（例 S0-impl）。結果は $D/SUMMARY.txt（1 門 1 行 ✓/✗）と各 log。最後に ALL_DONE。
# v0800/tools/run-gates.sh の写し（v0.8.1 の S0・lead の L10）。変えた所:
#   - 基準は main e9d80ea（v0.8.0 のマージ。v0810/base-e9d80ea＝v0810/wt-e9d80ea で VITE_BASE=/ww2-torpedo-boat/ VITE_BUILD_REF=main VITE_BUILD_SHA=e9d80ea
#     npx vite build。今の木も同じビルド番号 main@e9d80ea で作って比べる）・出力は v0810/impl/<stage>/。
#   - us_04 の組（SKIP の名前 us04）: us_04 は基準にあるので、ab-us04・hud-us04 は A＝基準・B＝今の木で濾しなし（SET=us04）。
#     ab-us04-noradar・hud-us04-noradar は今までどおり A＝B＝今の木で NORADAR=1。v0.8.0 の A4（S4 の commit の site）の枝は消した。
#   - g2 は既定で US04=1（基準に us_04 の帯の表がある）。
#   - art-perf は既定で飛ばす（SKIP の既定 "art-perf"。回すなら SKIP="" で）。
#   - snapshots の門は git status で「変わった・新しい」写しのファイルを名指す（v0.8.0 は git diff だけ＝新しいファイルを見落とした）。
# ほかは v0.8.0 のまま: 再生の A/B を音の 3 つの状態で回す（scripts/headless/lib.mjs の環境変数）:
#   default＝今までどおり（AudioContext は suspended）・audio＝AUDIO=1（autoplay を許す＝running）・noaudio＝NOAUDIO=1（AudioContext なし＝音のエンジンが無い）
# 環境変数:
#   AUDIO_STATES（既定 "default audio noaudio"）: ab-replay all 58 と hud-ab base 16 を回す状態
#   SMALL_AUDIO_STATES（既定 "default"）: 小さい組（ab-replay・hud-ab の jp04base 8・jp03 4）を回す状態
#   SKIP（既定 "art-perf"。空白区切り）: 飛ばす門 build typecheck lint test g2 ab hud us04 tex-ab art-perf snapshots（build を飛ばすと $D/site をそのまま使う）
#   AB_ENV（既定 なし）: ab-replay・hud-ab だけに渡す環境変数（短い確かめ用。例 AB_ENV="MISSION=us_02 SECS=20"＝どの組も us_02 の 1 件 20 秒になる）
#   JOBS（既定 3）
# SUMMARY の名前: 既定の状態は ab-all・hud-base …、ほかの状態は @audio・@noaudio を付ける（log も同じ名前）。art-perf は参考（門ではない）。
# 既知の揺れ（v0.7.0 から）: ab-all の us_02 seed 1 の最後のフレーム → result の組を同じ状態で JOBS=1 で回し直す（下）。
# 揺れの回し直し（v0.8.0 S5 の L62）: ab-all で違った件の組（log の same:false の行の先頭の語＝result・nodawn など）を同じ音の状態・JOBS=1 で回し直す。
#   違った件の行（最初の違いのフレームと欄）を SUMMARY にそのまま写す（既知の us_02 seed 1 の最後のフレームの .t かは人が見る。自動で受け入れない＝ab-all の ✗ は残す）。
# 時間の目安（v0.8.0 の実測）: npm test 約 6 分・g2 約 20 分・ab-all は 1 状態 1〜2 分・hud-base と小さい組は 1 分以内・us04 の 4 組で数分・tex-ab 約 1 分。
set -u
STAGE=${1:?stage}
cd /home/user/ww2-torpedo-boat
SP=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad
D=$SP/v0810/impl/$STAGE; mkdir -p $D
A=$SP/v0810/base-e9d80ea; B=$D/site
AUDIO_STATES=${AUDIO_STATES:-"default audio noaudio"}
SMALL_AUDIO_STATES=${SMALL_AUDIO_STATES:-"default"}
SKIP=" ${SKIP-art-perf} "
AB_ENV=${AB_ENV:-}
JOBS=${JOBS:-3}
SUM=$D/SUMMARY.txt; : > $SUM
ok(){ echo "✓ $1" >> $SUM; }; ng(){ echo "✗ $1" >> $SUM; }
skip(){ case "$SKIP" in *" $1 "*) echo "- $1 (SKIP)" >> $SUM; return 0;; esac; return 1; }
[ -d $A/assets ] || { ng "base site $A が無い（v0810/wt-e9d80ea で VITE_BASE=/ww2-torpedo-boat/ VITE_BUILD_REF=main VITE_BUILD_SHA=e9d80ea npx vite build --outDir $A）"; echo ALL_DONE >> $SUM; echo ALL_DONE; exit 1; }
skip build || { rm -rf $B && VITE_BASE=/ww2-torpedo-boat/ VITE_BUILD_REF=main VITE_BUILD_SHA=e9d80ea npx vite build --outDir $B > $D/build.log 2>&1 && ok build || ng build; }
skip typecheck || { npm run typecheck > $D/typecheck.log 2>&1 && ok typecheck || ng typecheck; }
skip lint || { npm run lint > $D/lint.log 2>&1 && ok lint || ng lint; }
skip test || { npm test > $D/test.log 2>&1 && ok "npm test $(grep -E 'Tests +[0-9]+ passed' $D/test.log | tail -1 | tr -s ' ')" || ng "npm test (see test.log)"; }
skip g2 || { G6=1 ALLY=1 EVAC=1 US04=${US04:-1} OUTDIR=$D/g2 bash scripts/headless/g2.sh > $D/g2.log 2>&1 && ok "g2 $(grep -o 'OK [0-9]* DIFF [0-9]*' $D/g2.log | tail -1)" || ng "g2 $(grep -o 'OK [0-9]* DIFF [0-9]*' $D/g2.log | tail -1)"; }
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
# us_04 の組（v0.8.1: A＝基準 e9d80ea・濾しなし。NORADAR は A＝B＝今の木）: 名前 アプリ A B 足す環境変数（既定の音の状態だけ）
abrun04(){ # name tool A B env...
  local n=$1 t=$2 a=$3 b=$4; shift 4
  env $AB_ENV "$@" A=$a B=$b SET=us04 CAM=1 JOBS=$JOBS node scripts/headless/$t.mjs > $D/$n.log 2>&1
  local line; line=$(grep -E '^cases' $D/$n.log | tail -1)
  if echo "$line" | grep -q 'diff 0'; then ok "$n $line"; else ng "$n $line"; fi
  grep -E 'same:(true|false)' $D/$n.log | sed -E 's/^/    /' | cut -c1-260 >> $SUM
}
if ! skip us04; then
  abrun04 ab-us04 ab-replay $A $B
  abrun04 hud-us04 hud-ab $A $B
  abrun04 ab-us04-noradar ab-replay $B $B NORADAR=1
  abrun04 hud-us04-noradar hud-ab $B $B NORADAR=1
fi
# 既知の揺れ（v0.7.0 から）: nodawn/result の us_02 seed 1 の最後のフレームの .t。ab-all（どの状態でも）が ✗ なら、違った件の組を同じ状態で 1 本ずつ回し直す（v0.8.0 S5 の L62）
for st in $AUDIO_STATES; do
  n=ab-all; [ "$st" = default ] || n="ab-all@$st"
  if grep -q "^✗ $n " $SUM; then
    grep 'same:false' $D/$n.log | cut -c1-300 | sed -E "s/^/    differs ($n): /" >> $SUM
    for set in $(grep 'same:false' $D/$n.log | awk '{print $1}' | sort -u); do
      r=$D/ab-rerun-$set@$st.log
      env $(state_env $st) $AB_ENV A=$A B=$B SET=$set CAM=1 JOBS=1 node scripts/headless/ab-replay.mjs > $r 2>&1
      line=$(grep -E '^cases' $r | tail -1)
      echo "$line" | grep -q 'diff 0' && ok "$n rerun of $set (JOBS=1, same audio state; the ✗ above stays): $line" || ng "$n rerun of $set still differs (see $(basename $r))"
    done
  fi
done
skip tex-ab || { A=$A B=$B CHECK=1 JOBS=$JOBS OUT=$D/tex-ab.json node scripts/headless/tex-ab.mjs > $D/tex-ab.log 2>&1 && ok "tex-ab CHECK=1 $(grep -c '✗' $D/tex-ab.log) ✗ lines" || ng "tex-ab (see tex-ab.log)"; }
skip art-perf || { A=$A B=$B ROUNDS=2 OUT=$D/art-perf.json node scripts/headless/art-perf.mjs > $D/art-perf.log 2>&1 && ok "art-perf(参考) $(tail -1 $D/art-perf.log | cut -c1-80)" || ng "art-perf(参考。門ではない) $(tail -1 $D/art-perf.log | cut -c1-120)"; }
skip snapshots || {
  snaps=$(git -C /home/user/ww2-torpedo-boat status --porcelain --untracked-files=all -- tests/__snapshots__ 2>/dev/null | tr -s ' ' | tr '\n' ';')
  [ -z "$snaps" ] && ok "snapshots untouched" || ng "snapshots changed: $snaps"
}
echo ALL_DONE >> $SUM; echo ALL_DONE
