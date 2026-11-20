#!/usr/bin/env python3
# inf-<mission>-0/1.jsonl（hull-probe の INF=0 今の規則・INF=1 通過の半径 Infinity を仮に当てた）を並べる
import json, sys, statistics as S
H = json.load(open('/home/user/ww2-torpedo-boat/data/hit_rate_model.json'))['kpi_by_range']
D = '/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0820/ip1'
def load(m, i):
    out = {}
    for l in open(f'{D}/inf-{m}-{i}.jsonl'):
        x = json.loads(l); c = x['c']
        if 'skipped' in x['r']: continue
        out[(c['seed'], c['range'], c['side'], c['target'])] = x['r']
    return out
def band(r):
    for b in H:
        if b['range_m_min'] <= r < b['range_m_max']: return b['band']
    return '>2000yd'
q = lambda xs, p: sorted(xs)[min(len(xs) - 1, int(p * len(xs)))] if xs else float('nan')
for m in sys.argv[1:]:
    A, B = load(m, 0), load(m, 1)
    keys = sorted(set(A) & set(B))
    print(f'== {m}: 夜 {len(keys)}（両方で撃てた）')
    for name, R in (('今の規則', A), ('Infinity', B)):
        fired = hits = other = duds = 0; kb = {}; settle = []; last = []
        for k in keys:
            r = R[k]; ls = []; rs = []
            for t in r['rec']:
                fired += 1
                if t['out'] == 'hit':
                    hits += 1
                    if t['target'] != k[3]: other += 1
                if t['out'] == 'dud': duds += 1
                if t['launchS'] is not None and t['resolveS'] is not None:
                    settle.append(t['resolveS'] - t['launchS']); ls.append(t['launchS']); rs.append(t['resolveS'])
            if ls and rs: last.append(max(rs) - max(ls))
            for rng, h, dud, kpi in r['shots']:
                if not kpi: continue
                b = kb.setdefault(band(rng), [0, 0]); b[0] += 1; b[1] += 1 if h and not dud else 0
        bands = '・'.join(f"{b} {v[1]}/{v[0]}（{100*v[1]/v[0]:.0f}%）" for b, v in sorted(kb.items(), key=lambda z: [x['band'] for x in H].index(z[0]) if z[0] in [x['band'] for x in H] else 9))
        print(f'  {name}: 魚雷 {fired}・命中 {hits}（{100*hits/max(1,fired):.1f}%/本）・不発 {duds}・狙った艦の外に命中 {other}')
        print(f'    KPI（正しく狙った 1 本＝shots の kpiTarget・不発を除く命中）: {bands}')
        print(f'    1 本の決着まで（発射から）中央値 {S.median(settle):.1f} 秒・90% {q(settle,0.9):.1f}・最大 {max(settle):.1f}／最後の 1 本の決着（最後の発射から）中央値 {S.median(last):.1f}・90% {q(last,0.9):.1f}・最大 {max(last):.1f} 秒')
    d = []
    for k in keys:
        ra, rb = A[k], B[k]
        la = max((t['resolveS'] for t in ra['rec'] if t['resolveS'] is not None), default=None); lb = max((t['resolveS'] for t in rb['rec'] if t['resolveS'] is not None), default=None)
        if la is not None and lb is not None: d.append(lb - la)
    print(f'  最後の 1 本の決着の遅れ（Infinity − 今。同じ夜）: 中央値 {S.median(d):.1f}・90% {q(d,0.9):.1f}・最大 {max(d):.1f} 秒・遅れた夜 {sum(1 for x in d if x > 0.05)}/{len(d)}')
