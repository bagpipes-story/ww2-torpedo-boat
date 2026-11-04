#!/usr/bin/env bash
# 模擬の表の md5 の門（v0.6.10 S5a で作り直した。spec-v0610 part 2 の「the 17 old sim md5s」。値は CHANGELOG v0.6.9「中立の証拠」と v0.6.10 S0b・S4）:
#   既定: ほかの任務の模擬 17 本（pt-pass jp_05・convoy jp_01・dawn-strike・patrol-air jp_02）が v0.6.8 の md5 と同じ（OK 17・DIFF 0）。
#   G6=1: jp_04 の卯月を切った表 8 本（ALLY_OFF=1）も。ALLY=1: 卯月のいる表 10 本も。どちらも v0.6.10 実機 2 回目（揚陸 140 → 110 秒）の md5 の頭 8 桁
#   （実機 1 回目＝撃っても照らされても PT は去らない・揚陸 140 秒の値は CHANGELOG v0.6.10 実機 1 回目）
#   （S0b・S4 の値は CHANGELOG v0.6.10 の S0b・S4）。
# 模擬の scripts/*.ts を esbuild で束ねて node で回し、標準出力の md5 を比べる（並べて JOBS 本ずつ）。DIFF が 1 つでもあれば終了コード 1。
# 実行: [G6=1] [ALLY=1] [JOBS=4] [OUTDIR=<scratch>] bash scripts/headless/g2.sh
set -u
cd "$(dirname "$0")/../.."
OUT="${OUTDIR:-$(mktemp -d)}"
mkdir -p "$OUT"
for s in pt-pass-sim convoy-sim dawn-strike-sim patrol-air-sim landing-sim; do
  npx esbuild "scripts/$s.ts" --bundle --platform=node --format=esm --log-level=warning --outfile="$OUT/$s.mjs" || exit 2
done
# 名前|束ねた模擬|env|期待する md5（頭だけでもよい）
CASES=(
  "pt1|pt-pass-sim|N=400 SEED=1 TABLE=1|6eda39f5daf40b69aa1f9edd0b19cd12"
  "pt2|pt-pass-sim|N=400 SEED=1 TABLE=2|3ac326d892d5cf0980da0c5782a33603"
  "pt3|pt-pass-sim|N=400 SEED=1 TABLE=3|e7482e1a48aa82b3e977446a46e8348c"
  "pt1e|pt-pass-sim|N=400 SEED=1 ENG_OFF=1 TABLE=1|c0bd15f233a286bba182a7571e9ee78e"
  "pt2e|pt-pass-sim|N=400 SEED=1 ENG_OFF=1 TABLE=2|d3e42cb350ceb01fd789581923cf5290"
  "cv1|convoy-sim|N=400 TABLE=1|c564eabdc624ca5b5fb07974df79b228"
  "cvh0|convoy-sim|HARD=1 GUNBOAT_OFF=1 N=400|dd78168046b2237c7ab3db6d4f528677"
  "cvh0b|convoy-sim|HARD=1 GUNBOAT_OFF=1 N=400 SEED=401|ba536620bb7a27f0ea9b2502aa93d0a2"
  "cvh|convoy-sim|HARD=1 N=400|aedb6fa4512ca228b05b75710112ff5c"
  "cvhb|convoy-sim|HARD=1 N=400 SEED=401|721d247163d210fc2d4066cfd10ae2ad"
  "cvh2|convoy-sim|HARD=1 TABLE=2 N=400|0e48997a79f0f2986ba57c57cab65b43"
  "ds1|dawn-strike-sim|TABLE=1|574f2f1ff18e9b195e99c1afde3483aa"
  "ds0|dawn-strike-sim||26fe087e6fc6c24d7dd18a5a8a01160f"
  "dsm|dawn-strike-sim|MISSION=us_03,jp_01|6b760079ee6c5109ec7a7b3dce4e9104"
  "pa1|patrol-air-sim|N=400 BLOCKS=2 TABLE=1|cc6a3c00bce2e59d89cb9aedbc87857f"
  "pa2|patrol-air-sim|N=400 BLOCKS=2 TABLE=2|5e4e269037e55bcfd432d4df82d59844"
  "pa3|patrol-air-sim|N=400 BLOCKS=2 TABLE=3|61050277ea6c13a0e0f2e0f0ee762153"
)
if [ "${G6:-0}" = "1" ]; then
  CASES+=(
    "g6|landing-sim|ALLY_OFF=1|cd5d129d" "g6t1|landing-sim|ALLY_OFF=1 TABLE=1|b5bf65fa" "g6t2|landing-sim|ALLY_OFF=1 TABLE=2|cef7e1a1" "g6t3|landing-sim|ALLY_OFF=1 TABLE=3|3a765514"
    "g6h|landing-sim|ALLY_OFF=1 HARD=1|d1b237bf" "g6ht1|landing-sim|ALLY_OFF=1 HARD=1 TABLE=1|35c100e2" "g6ht2|landing-sim|ALLY_OFF=1 HARD=1 TABLE=2|964b4925" "g6ht3|landing-sim|ALLY_OFF=1 HARD=1 TABLE=3|d1c923a7"
  )
fi
if [ "${ALLY:-0}" = "1" ]; then
  CASES+=(
    "al|landing-sim||6bb846a1" "alt1|landing-sim|TABLE=1|742ae9eb" "alt2|landing-sim|TABLE=2|03226271" "alt3|landing-sim|TABLE=3|2d08c38d" "alt4|landing-sim|TABLE=4|d361dabf"
    "alh|landing-sim|HARD=1|babb3cfe" "alht1|landing-sim|HARD=1 TABLE=1|4078c0bd" "alht2|landing-sim|HARD=1 TABLE=2|8ef8f2ec" "alht3|landing-sim|HARD=1 TABLE=3|87ade449" "alht4|landing-sim|HARD=1 TABLE=4|e25f1d37"
  )
fi
run() {
  IFS='|' read -r name sim envs want <<<"$1"
  # shellcheck disable=SC2086
  env $envs node "$OUT/$sim.mjs" > "$OUT/$name.txt" 2> "$OUT/$name.err"
  got=$(md5sum < "$OUT/$name.txt" | cut -c1-32)
  if [ "${got:0:${#want}}" = "$want" ]; then echo "OK   $name $got"; else echo "DIFF $name $got（期待 $want）"; fi
}
export -f run
export OUT
printf '%s\n' "${CASES[@]}" | xargs -P "${JOBS:-4}" -I{} bash -c 'run "$@"' _ {} | sort -k2 | tee "$OUT/g2.result"
ok=$(grep -c '^OK' "$OUT/g2.result")
diff=$(grep -c '^DIFF' "$OUT/g2.result")
echo "OK $ok DIFF $diff（${#CASES[@]} 本・出力 $OUT）"
[ "$diff" = "0" ] && [ "$ok" = "${#CASES[@]}" ]
