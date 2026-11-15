# v0.8.0 S1: CHANGELOG の v0.8.0 の変更点に S1 の塊を足す（S0 の門の行の直後・既知の制約の前）。引数: テストの件数 ファイル数
import sys
R='/home/user/ww2-torpedo-boat/CHANGELOG.md'
B='/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0800/impl/S1-tools/changelog-s1.txt'
tests, files = sys.argv[1], sys.argv[2]
s=open(R,encoding='utf8').read()
blk=open(B,encoding='utf8').read().replace('npm test NNNN 件（FFF ファイル）', f'npm test {tests} 件（{files} ファイル）')
assert 'NNNN' not in blk and '  - S1（純粋な規則' not in s
anchor='結果は次の commit でこの行に足す）。\n- 既知の制約（S0 の時点。'
assert s.count(anchor)==1
s=s.replace(anchor, '結果は次の commit でこの行に足す）。\n'+blk+'- 既知の制約（S0 の時点。')
open(R,'w',encoding='utf8').write(s)
print('inserted', len(blk), 'chars')
