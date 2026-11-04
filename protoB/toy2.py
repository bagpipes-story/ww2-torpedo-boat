# toy Monte Carlo for design B (abstract; not the repo). seeded.
import random, math, statistics as st, sys
CEP=32.0; SIG=CEP/1.1774; BLAST=25.0; HALF=9.0; DMG=35; HP=60
WAVES={'normal':[(30,2),(95,3),(160,3),(215,2)],'hard':[(30,3),(95,4),(160,4),(215,3)]}
FLIGHT_BOMBS=8; FIRST=9.0; GAP=2.2
CAVE_SLOTS=4; COVER_SLOTS=6; HAUL=8.0
# quay: 6 groups x 3 boats, row spacing 12 m, groups 60 m apart (group 0 = player's)
def quay_pos(g,i): return (g*60.0+i*12.0, 0.0)
def run(policy, mode, rng):
    boats=[]
    for g in range(6):
        for i in range(3):
            boats.append(dict(g=g,i=i,hp=HP,st='MOORED',pos=quay_pos(g,i),ready=1e9,player=(g==0 and i==0)))
    P=policy
    # schedule: per group, time the player reaches it (pickup) and where it goes
    t=P['start']; caves=CAVE_SLOTS; covers=COVER_SLOTS
    order=P['order'](rng)
    for gi,g in enumerate(order):
        if gi>=P['groups']: break
        t+=P['pick_s']+rng.uniform(0,P['lag'])
        for b in boats:
            if b['g']!=g: continue
            dest=None
            if caves>0 and P['use_cave']: caves-=1; dest=('CAVE',t+P['cave_travel']+HAUL*(CAVE_SLOTS-caves))
            elif covers>0 and P['use_cover']: covers-=1; dest=('COVER',t+P['cover_travel'])
            else: dest=('SCATTER',t+5)
            b['plan']=(t,dest)
    def state(b,now):
        if b['hp']<=0: return 'SUNK'
        if 'plan' not in b: return 'MOORED'
        t0,(kind,t1)=b['plan']
        if now<t0: return 'MOORED'
        if now<t1: return 'MOVING'
        return {'CAVE':'CAVE','COVER':'COVER','SCATTER':'SEA'}[kind]
    # player: in group0; player hides after last pickup if policy says, else stays leading (exposed MOVING)
    lost_player=False
    if P['player_hides'] and P['player_hide_t']<20: boats[0]['st']='X'; boats[0]['pos']=(-9999,0)
    for (tw,nf) in WAVES[mode]:
        for b in boats:
            if b['hp']>0 and not b['player'] and state(b,tw)=='COVER' and rng.random()<P.get('cover_reveal',0.15): b['revealed']=True
        for f in range(nf):
            # target choice at flight start (visible boats; weight moored cluster)
            now=tw
            vis=[b for b in boats if not b['player'] and (state(b,now) in ('MOORED','MOVING','SEA') or (state(b,now)=='COVER' and b.get('revealed')))]
            pl=boats[0]
            if pl['hp']>0 and not (P['player_hides'] and now>P['player_hide_t']): vis.append(pl)
            if not vis: continue
            w=[]
            for b in vis:
                s=state(b,now)
                w.append(2.0 if b['player'] else (3.0 if s in ('MOORED','COVER') else (2.0 if s=='MOVING' else 1.5)))
            tgt=rng.choices(vis,weights=w)[0]
            for k in range(FLIGHT_BOMBS):
                tb=tw+FIRST+GAP*k
                if tgt['hp']<=0:
                    break  # flight would retarget only next wave in repo design
                s=state(tgt,tb) if not tgt['player'] else ('PLAYER')
                if s=='CAVE' or (s=='COVER' and not tgt.get('revealed')): break
                if s=='COVER': s='MOORED'  # lost sight -> leave
                if s=='MOORED':
                    r=SIG*math.sqrt(-2*math.log(1-rng.random())); a=rng.uniform(0,2*math.pi)
                    ix,iy=(tgt['pos'] if state(tgt,tb)=='MOORED' else (5000+tgt['g']*100+tgt['i']*40,5000))[0]+r*math.cos(a),tgt['pos'][1]+r*math.sin(a)
                    for b in boats:
                        bp=b['pos'] if state(b,tb)=='MOORED' else ((5000+b['g']*100+b['i']*40,5000) if state(b,tb)=='COVER' and b.get('revealed') else None)
                        if b['hp']>0 and bp is not None:
                            if math.hypot(bp[0]-ix,bp[1]-iy)<=BLAST+HALF*0.5: b['hp']-=DMG
                else:
                    p = P['p_player'] if s=='PLAYER' else (P['p_move'] if s=='MOVING' else P['p_sea'])
                    if rng.random()<p: tgt['hp']-=DMG
    alive=sum(1 for b in boats if b['hp']>0)
    return alive, boats[0]['hp']<=0
POL={
 'stay':   dict(start=0,groups=0,pick_s=0,lag=0,order=lambda r:[],use_cave=1,use_cover=1,cave_travel=0,cover_travel=0,player_hides=1,player_hide_t=10,p_player=0,p_move=0,p_sea=0),
 'bot':    dict(start=0,groups=6,pick_s=14,lag=0,order=lambda r:[0,1,2,3,4,5],use_cave=1,use_cover=1,cave_travel=25,cover_travel=50,player_hides=0,player_hide_t=1e9,p_player=0.02,p_move=0.15,p_sea=0.20),
 'human':  dict(start=4,groups=6,pick_s=20,lag=12,order=lambda r:r.sample(range(6),6),use_cave=1,use_cover=1,cave_travel=30,cover_travel=65,player_hides=0,player_hide_t=1e9,p_player=0.06,p_move=0.15,p_sea=0.20),
 'human_cave':dict(start=4,groups=6,pick_s=20,lag=12,order=lambda r:r.sample(range(6),6),use_cave=1,use_cover=0,cave_travel=30,cover_travel=65,player_hides=0,player_hide_t=1e9,p_player=0.06,p_move=0.15,p_sea=0.20),
 'cave_hide':dict(start=4,groups=2,pick_s=20,lag=8,order=lambda r:[0,1],use_cave=1,use_cover=0,cave_travel=30,cover_travel=0,player_hides=1,player_hide_t=60,p_player=0.06,p_move=0.15,p_sea=0.20),
 'scatter_all':dict(start=4,groups=6,pick_s=10,lag=6,order=lambda r:r.sample(range(6),6),use_cave=0,use_cover=0,cave_travel=0,cover_travel=0,player_hides=0,player_hide_t=1e9,p_player=0.06,p_move=0.15,p_sea=0.20),
}
for mode in ('normal','hard'):
  for name,P in POL.items():
    rng=random.Random(1); res=[run(P,mode,rng) for _ in range(400)]
    al=[a for a,_ in res]; ps=sum(1 for _,d in res if d)/len(res)
    print(f"{mode:6s} {name:11s} median {st.median(al):4.1f} p10 {sorted(al)[40]:2d} p90 {sorted(al)[360]:2d} P(>=6) {sum(1 for a in al if a>=6)/len(al)*100:5.1f}% player_sunk {ps*100:4.1f}%")
