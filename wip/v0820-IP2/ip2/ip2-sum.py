#!/usr/bin/env python3
# before-<set>.jsonl（IP1 の木）と after-<set>.jsonl（IP2）を並べる: 命中／本・狙った艦の外・KPI の帯・撃ち尽くしの呼びかけの遅れ（最後の発射から）・近すぎての数
import json, statistics as S, sys
D = '/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0820/ip2'
H = json.load(open('/home/user/ww2-torpedo-boat/data/hit_rate_model.json'))['kpi_by_range']
NAMES = [b['band'] for b in H]
def band(r):
    for b in H:
        if b['range_m_min'] <= r < b['range_m_max']: return b['band']
    return NAMES[-1]
def load(tag, s):
    out = {}
    for l in open(f'{D}/{tag}-{s}.jsonl'):
        x = json.loads(l); c = x['c']
        if 'skipped' in x['r']: continue
        out[(c['seed'], c['range'], c['side'], c['target'])] = x['r']
    return out
def stats(R, keys):
    fired = hits = other = under = 0; kb = {n: [0, 0] for n in NAMES}; call = []; nocall = 0
    for k in keys:
        r = R[k]; ls = [t['launchS'] for t in r['rec'] if t['launchS'] is not None]
        for t in r['rec']:
            fired += 1
            if t['out'] == 'hit':
                hits += 1
                if t['target'] != k[3]: other += 1
        under += r.get('under') or 0
        for rng, h, dud, kpi in r['shots']:
            if kpi: b = kb[band(rng)]; b[0] += 1; b[1] += 1 if h and not dud else 0
        if ls and r.get('callAt') is not None: call.append(r['callAt'] - max(ls))
        else: nocall += 1
    return fired, hits, other, under, kb, call, nocall
fmt = lambda kb: '・'.join(f"{n} {v[1]}/{v[0]}" for n, v in kb.items() if v[0])
for s in sys.argv[1:]:
    A, B = load('before', s), load('after', s)
    keys = sorted(set(A) & set(B))
    a, b = stats(A, keys), stats(B, keys)
    print(f'== {s}: {len(keys)} 夜')
    for name, x in (('前', a), ('後', b)):
        f, h, o, u, kb, call, nc = x
        cs = f"中央値 {S.median(call):.1f}・最大 {max(call):.1f} 秒（{len(call)} 夜・出ない {nc}）" if call else f'出ない {nc}'
        print(f'  {name}: 魚雷 {f}・命中 {h}（{100*h/max(1,f):.1f}%/本）・狙った艦の外 {o}・近すぎて {u}・KPI {fmt(kb)}・呼びかけ（最後の発射から）{cs}')
