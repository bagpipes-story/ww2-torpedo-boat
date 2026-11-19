#!/usr/bin/env python3
# hull-probe の jsonl をまとめる: 魚雷ごとの結末・描いた船体を通って当たらなかった艦の理由（艦種ごと）・円と絵のずれ
import json, sys, collections as C

def kind(cls, j, mission):
    if mission == 'us_05':
        return {5: '戦艦', 6: '戦艦', 3: '重巡', 4: '時雨（見張りの駆逐艦）', 7: '見張りの駆逐艦（ハード）'}.get(j, '前衛の駆逐艦')
    return cls[j] + f'#{j}'

for path in sys.argv[1:]:
    mission = 'us_05' if 'us05' in path else 'us_02' if 'us02' in path else 'us_04'
    nights = skipped = 0
    outs = C.Counter(); tgt = C.Counter(); hitk = C.Counter()
    cross = C.Counter(); why = C.defaultdict(C.Counter); arm = C.Counter()
    devp = 0.0; deva = 0.0; devn = 0; errs = 0
    passmiss = C.Counter(); passmiss_then = C.Counter()
    for line in open(path):
        x = json.loads(line); r = x['r']; errs += len(x['errors'])
        if 'skipped' in r: skipped += 1; continue
        nights += 1; cls = r['classes']; tk = kind(cls, r['target'], mission)
        for d in r['dev']:
            devp = max(devp, d['pos']); deva = max(deva, d['ang']); devn += d['n']
        for t in r['rec']:
            tgt[tk] += 1
            o = t['out'] or 'none'
            outs[o] += 1
            if o in ('hit', 'dud', 'late'): hitk[(kind(cls, t['target'], mission), o)] += 1
            if t['passMiss']:
                passmiss[f"狙い {tk}・通り過ぎの判定の艦 {kind(cls, t['missNear'], mission) if t['missNear'] >= 0 else '-'}"] += 1
            for js, c in t['cross'].items():
                j = int(js)
                if c['visible'] == 0: continue
                k = kind(cls, j, mission)
                if o in ('hit', 'dud', 'late') and t['target'] == j: continue  # 当たった艦（当たる前に描いた船体に入った分）
                cross[k] += 1
                if c['firstRun'] < r['armingM']: arm[k] += 1
                if c['resolved'] > 0:
                    near = kind(cls, t['missNear'], mission) if t['missNear'] >= 0 else '-'
                    why[k][f'決着済み（通り過ぎの外れ。判定の艦 {near}）'] += 1
                    passmiss_then[k] += 1
                elif c['unarmed'] == c['f']: why[k]['武装前（100 m の内）'] += 1
                elif c['sinking'] > 0: why[k]['艦が沈み始めていた'] += 1
                elif c['okOut'] > 0: why[k][f'描いた船体の内・カプセルの外（{o}）'] += 1
                else: why[k][f'ほか（{o}）'] += 1
    print(f'== {path.split("/")[-1]}: 夜 {nights}（飛ばした {skipped}）・魚雷 {sum(outs.values())}・page errors {errs}')
    print('  狙った艦ごとの本数:', dict(tgt))
    print('  結末:', dict(outs))
    print('  当たった艦:', {f'{a}/{b}': v for (a, b), v in hitk.items()})
    print('  通り過ぎの外れ（走っている間の決着）:', dict(passmiss))
    print('  描いた船体を通って当たらなかった（艦ごと・見えている絵）:', dict(cross))
    for k, v in why.items(): print(f'    {k}: {dict(v)}')
    print('  うち最初に入った時に武装前（走った距離 < 100 m）:', dict(arm))
    print(f'  当たりの円の中心と絵の位置の最大のずれ {devp:.3g} m・軸と絵の角の最大のずれ {deva:.3g}°（{devn} 艦×フレーム）')
