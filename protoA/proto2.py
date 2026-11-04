# Abstract Monte Carlo for design A (NOT the real core): disc scatter R=45 m, capsule hit (half-len 9, r 27.15),
# 3 flights x 4 planes x 2 bombs, bombs at t0+10.9+2.2k, flight leaves when its target sinks or hides. Wave period 42.3 s.
import math, random, sys, statistics as st
R=32*math.sqrt(2); HL=9; HR=2.15+25; HP=60; DMG=35; V=13*0.5144*5; VP=27.5*0.5144*5
PER=42.3; REL=[10.9+2.2*k for k in range(8)]
def near(px,py,bx,by,hd):  # capsule along heading hd (rad)
    ux,uy=math.sin(hd),-math.cos(hd); dx,dy=px-bx,py-by; t=max(-HL,min(HL,dx*ux+dy*uy))
    return (dx-t*ux)**2+(dy-t*uy)**2<=HR*HR
def run(policy, waves, cap, nopen, rnd):
    pier=[(1560+30*i,2500) for i in range(17)]
    spots=[('shelter',1400,2650,cap[0]),('yagaji',3100,2000,cap[1]),('kouri',2600,600,cap[2])]
    opens=[(1000+380*(k%4), 1500+450*(k//4)) for k in range(nopen)]
    B=[]
    for i,(x,y) in enumerate(pier): B.append(dict(x=x,y=y,hp=HP,hd=0,dest=None,hid=False,mov=False,kind='pier'))
    # assignment on order: west->shelter, east->yagaji, middle->kouri, rest->open
    order=list(range(17)); asg={}
    w=order[:cap[0]]; e=order[::-1][:cap[1]]; rest=[i for i in order if i not in w and i not in e]
    k=rest[:cap[2]]; o=rest[cap[2]:]
    for i in w: asg[i]=(1400,2650,True)
    for i in e: asg[i]=(3100,2000,True)
    for i in k: asg[i]=(2600,600,True)
    for j,i in enumerate(o): asg[i]=opens[j%max(1,nopen)]+(False,) if nopen else (pier[i][0],pier[i][1],False)
    import os
    tord={'none':None,'hide':0.5,'decoy':float(os.environ.get('DT','0.5')),'human':rnd.uniform(1,8) if os.environ.get('HL') is None else rnd.uniform(26,40),'late':float(os.environ.get('LT','30'))}[policy]
    player=dict(x=1800,y=2450,hp=HP,hd=0,alive=True)
    pq={'decoy':0.9,'human':0.75}.get(policy,0)  # chance player's decoy-and-hide cancels the flight before any hit
    dt=0.05; t=0; flights=[]
    T=waves*PER
    while t<T:
        if tord is not None and t>=tord:
            for i,b in enumerate(B):
                if b['dest'] is None: b['dest']=asg[i]; b['mov']=True
            tord=None
        for b in B:
            if b['hp']<=0 or not b['mov']: continue
            dx,dy=b['dest'][0]-b['x'],b['dest'][1]-b['y']; d=math.hypot(dx,dy)
            if d<V*dt: b['x'],b['y']=b['dest'][:2]; b['mov']=False; b['hid']=b['dest'][2]; b['kind']='spot' if b['hid'] else 'open'
            else: b['x']+=dx/d*V*dt; b['y']+=dy/d*V*dt; b['hd']=math.atan2(dx,-dy)
        w=int(t/PER)
        if t-w*PER<dt and t>=w*PER:
            bx,by=1800+3000*math.sin(math.radians(90+90*w)),2000-3000*math.cos(math.radians(90+90*w))
            taken=set(); flights=[]
            decoy = policy in('decoy','human') and w>=1
            for f in range(3):
                if decoy and f==0: flights.append(('P',rnd.random()<pq)); continue
                best=None
                for cls in ('mov','pier','open'):
                    c=[i for i,b in enumerate(B) if b['hp']>0 and not b['hid'] and i not in taken and ((cls=='mov' and b['mov']) or (cls=='pier' and not b['mov'] and b['kind']=='pier') or (cls=='open' and not b['mov'] and b['kind']=='open'))]
                    if c: best=min(c,key=lambda i:(B[i]['x']-bx)**2+(B[i]['y']-by)**2); break
                if best is not None: taken.add(best); flights.append((best,True))
        tw=t-w*PER
        for fl in flights:
            tg,ok=fl
            if tg=='P':
                if not ok and any(abs(tw-r)<dt/2 for r in REL[:4]) and rnd.random()<0.25: player['hp']-=DMG
                continue
            b=B[tg]
            if b['hp']<=0 or b['hid']: continue
            for r in REL:
                if abs(tw-r)<dt/2 or (r<=tw<r+dt):
                    if not (r<=tw<r+dt): continue
                    a=rnd.random(); th=2*math.pi*rnd.random(); ax=b['x']+R*math.sqrt(a)*math.cos(th); ay=b['y']+R*math.sqrt(a)*math.sin(th)
                    for bb in B:
                        if bb['hp']>0 and near(ax,ay,bb['x'],bb['y'],bb['hd']): bb['hp']-=DMG
        t+=dt
    alive=sum(1 for b in B if b['hp']>0)+(1 if player['hp']>0 else 0)
    return alive, player['hp']<=0
pols=sys.argv[1].split(',') if len(sys.argv)>1 else ['none','late','hide','human','decoy']
waves=int(sys.argv[2]) if len(sys.argv)>2 else 5
cap=tuple(int(x) for x in (sys.argv[3] if len(sys.argv)>3 else '3,4,3').split(','))
nopen=17-sum(cap)
N=int(sys.argv[4]) if len(sys.argv)>4 else 200
for p in pols:
    rnd=random.Random(7); res=[run(p,waves,cap,nopen,rnd) for _ in range(N)]
    s=[a for a,_ in res]; s.sort()
    print(f"{p:6s} waves{waves} cap{cap} open{nopen}: median {st.median(s)} p10 {s[N//10]} p90 {s[9*N//10]} P(>=6) {sum(1 for x in s if x>=6)/N:.0%} sunk {sum(1 for _,k in res if k)/N:.0%}")
