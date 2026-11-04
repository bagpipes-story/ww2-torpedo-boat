# Toy model for design C (abstract; not repo code). Points, straight-line travel, per-bomb hit probabilities.
import random, math, sys, statistics as st
VP=70.0   # T-38 full 27.5kt*5 (m/s game)
VA=51.0   # AI 20kt*5
GROUPS={2:(1250,1200),3:(1800,1200),4:(2500,1100),5:(900,700),6:(2300,600)}
SPOTS={'cW':((600,1240),3,'cave'),'cE':((2800,1240),3,'cave'),'mW':((1000,220),3,'cover'),'mE':((2400,220),3,'cover')}
HOME=(1500,1240); START=(1500,1180)
def d(a,b): return math.hypot(a[0]-b[0],a[1]-b[1])
def run(seed,pol,hard=False,K=None):
    K=K or {}
    rng=random.Random(seed); hr=random.Random(seed*7919+13)
    waves=K.get('waves',[(25,1),(80,2),(135,3),(190,3)] if not hard else [(25,2),(80,3),(135,4),(190,4)])
    lead=10; reveal=K.get('reveal',0.2 if not hard else 0.3); dodge=K.get('dodge',0.6)
    W=K.get('w',{'moored':4,'haul':3,'found':4,'transit':2,'scatter':1,'wing':1.5})
    pd={'stay':0.35,'hud':0.2,'human':0.3,'bot':0.06,'scatter_all':0.25,'hide_only':0.25,'decoy':0.2}[pol]
    # boats: id -> dict(state, hp, pos, t_ready, group, spot)
    boats={}
    for g,p in GROUPS.items():
        for i in range(3): boats[(g,i)]=dict(st='moored',hp=2,g=g,ready=0,spot=None)
    for i in range(2): boats[(1,i)]=dict(st='wing',hp=2,g=1,ready=0,spot=None)
    cap={k:v[1] for k,v in SPOTS.items()}; found={k:False for k in SPOTS}
    ordered=set(); ppos=START; pfree=0.0; php=2; phidden=False; t=0.0
    plan=[]  # policy queue of groups
    # player route policy: decide at events
    def nearest_free(pos,kinds=('cave','cover')):
        best=None
        for k,(sp,c,kd) in SPOTS.items():
            if cap[k]>0 and kd in kinds:
                dd=d(pos,sp)
                if best is None or dd<best[0]: best=(dd,k)
        return best[1] if best else None
    def order(g,tnow,mode):
        ordered.add(g)
        pos=GROUPS[g]
        k=nearest_free(pos) if mode=='hide' else None
        if mode=='hide' and pol=='hide_only' and k is None: return
        for key,b in boats.items():
            if b['g']!=g or b['st'] in('sunk',): continue
            if k and cap[k]>0:
                cap[k]-=1; sp,_,kd=SPOTS[k]
                b['st']='transit'; b['spot']=k; b['ready']=tnow+d(pos,sp)/VA*1.3+(6 if kd=='cave' else 1); b['dest']=kd
            else:
                b['st']='transit'; b['spot']=None; b['ready']=tnow+5; b['dest']='scatter'
    targeted=[]
    def threatened(tnow):
        return [g for (g,te) in targeted if te>tnow]
    # player schedule: compute when free to act next
    react=0.0
    events=[]
    log={'lost':0}
    def choose_next(tnow):
        nonlocal ppos
        cand=[g for g in GROUPS if g not in ordered and any(boats[(g,i)]['st']=='moored' for i in range(3))]
        if not cand: return None
        if pol in('hud','bot'):
            th=[g for g in threatened(tnow) if g in cand]
            if th: return min(th,key=lambda g:d(ppos,GROUPS[g]))
            return min(cand,key=lambda g:d(ppos,GROUPS[g]))
        if pol in('human','scatter_all','hide_only','decoy'):
            th=[g for g in threatened(tnow) if g in cand]
            if th and hr.random()<0.5: return hr.choice(th)
            return min(cand,key=lambda g:d(ppos,GROUPS[g])) if hr.random()<0.7 else hr.choice(cand)
        return None
    wingord=False
    dt=0.5; ai_t=0.0; nexta=0.0
    flights=[]  # dict(target, t0, bombs)
    wi=0
    while t<240:
        # waves
        while wi<len(waves) and t>=waves[wi][0]-lead:
            n=waves[wi][1]; vis=[]
            for key,b in boats.items():
                s=b['st']
                if s=='moored': vis.append((key,W['moored']))
                elif s=='transit': vis.append((key,W['transit'] if b['dest']!='cave' or t<b['ready']-6 else W['haul']))
                elif s=='cover' and found[b['spot']]: vis.append((key,W['found']))
                elif s=='scatter': vis.append((key,W['scatter']))
                elif s=='wing' and not phidden: vis.append((key,W['wing']))
            pw={'stay':0,'hud':1.5,'human':1.5,'bot':1.0,'scatter_all':1.5,'hide_only':1.5,'decoy':3.0}[pol]
            if phidden: pw=0
            chosen=[]; pl_used=False
            for f in range(n):
                pool=[(k,w) for k,w in vis if k not in chosen and (W.get('onepergroup') is None or True)]
                if not pl_used and pw>0: pool.append(('P',pw))
                tot=sum(w for _,w in pool); r=rng.random()*tot if tot>0 else 0
                pick=None
                for k,w in pool:
                    r-=w
                    if r<=0: pick=k;break
                if pick is None: continue
                chosen.append(pick)
                if pick=='P': pl_used=True
                flights.append(dict(tg=pick,t0=waves[wi][0],nb=0))
                if pick!='P': targeted.append((pick[0],waves[wi][0]+28))
            # cover reveal (fixed draws)
            for k in SPOTS:
                r=rng.random()
                if SPOTS[k][2]=='cover' and r<reveal: found[k]=True
            wi+=1
        # player actions
        if t>=pfree and php>0:
            if pol=='stay' or (t>215 and pol!='decoy') or (pol=='decoy' and t>225):
                if not phidden:
                    pfree=t+d(ppos,HOME)/VP; ppos=HOME; phidden=True
                    if not wingord:
                        wingord=True
                        for i in range(2):
                            if boats[(1,i)]['st']=='wing': boats[(1,i)]['st']='cave'
            else:
                g=choose_next(t)
                if g is None:
                    # rescue found covers -> scatter them
                    fc=[k for k in SPOTS if found[k] and any(b['st']=='cover' and b['spot']==k for b in boats.values())]
                    if fc and pol in('hud','bot'):
                        k=fc[0]; ppos=SPOTS[k][0]; pfree=t+d(ppos,SPOTS[k][0])/VP+2
                        for b in boats.values():
                            if b['st']=='cover' and b['spot']==k: b['st']='scatter'
                        found[k]=False
                    elif pol in('bot','hud','stay','hide_only','human','scatter_all'):
                        pfree=t+d(ppos,HOME)/VP; ppos=HOME; phidden=True
                        for i in range(2):
                            if boats[(1,i)]['st']=='wing': boats[(1,i)]['st']='cave'
                    else: pfree=t+3
                else:
                    lag=hr.uniform(2,6) if pol in('human','scatter_all','hide_only','decoy') else 0.5
                    dist=max(0,d(ppos,GROUPS[g])-300)
                    pfree=t+dist/VP+lag; ppos=GROUPS[g]
                    mode='scatter' if pol=='scatter_all' else 'hide'
                    if pol=='human' and hr.random()<0.25: mode='scatter'
                    events.append((pfree,g,mode))
        for e in [e for e in events if e[0]<=t]:
            events.remove(e); order(e[1],e[0],e[2])
        # AI state progress
        for b in boats.values():
            if b['st']=='transit' and t>=b['ready']:
                b['st']={'cave':'cave','cover':'cover','scatter':'scatter'}[b['dest']]
        # flights
        for f in flights:
            if f.get('done'): continue
            tb=f['t0']+10.9+2.2*f['nb']
            tg=f['tg']
            if tg=='P':
                if phidden: f['done']=True; log['lost']+=1; continue
                if t>=tb:
                    f['nb']+=1
                    if rng.random()<pd: php-=1
                    if php<=0: f['done']=True
            else:
                b=boats[tg]
                if b['st']=='sunk': f['done']=True; continue
                hid = b['st']=='cave' or (b['st']=='cover' and not found[b['spot']])
                if hid: f['done']=True; log['lost']+=1; continue
                if t>=tb:
                    f['nb']+=1
                    s=b['st']
                    if s in('moored',) or (s=='cover'):
                        grp=[x for x in boats.values() if x['g']==b['g'] and x['st']==s and (s!='cover' or x['spot']==b['spot'])]
                        for x in grp:
                            if rng.random()<0.6:
                                x['hp']-=1
                                if x['hp']<=0: x['st']='sunk'
                    else:
                        p=0.15 if rng.random()<dodge else 0.55
                        if s=='transit' and b['dest']=='cave' and t>b['ready']-6: p=0.85
                        if s=='wing': p=0.3
                        if rng.random()<p:
                            b['hp']-=1
                            if b['hp']<=0: b['st']='sunk'
            if f['nb']>=8: f['done']=True
        if php<=0: break
        t+=dt
    alive=sum(1 for b in boats.values() if b['st']!='sunk')+(1 if php>0 else 0)
    return alive, php<=0, log['lost']
def table(hard=False,K=None,N=400):
    out=[]
    for pol in ['stay','hide_only','human','scatter_all','decoy','hud','bot']:
        r=[run(s,pol,hard,K) for s in range(1,N+1)]
        a=[x[0] for x in r]
        out.append(f"{pol:12s} med {st.median(a):4.1f} mean {st.mean(a):4.1f} P>=6 {sum(x>=6 for x in a)/N*100:5.1f}% sunk {sum(x[1] for x in r)/N*100:5.1f}% lost {st.mean(x[2] for x in r):.2f}")
    return out
if __name__=='__main__':
    print('NORMAL'); print('\n'.join(table()))
    print('HARD'); print('\n'.join(table(True)))
