import sys; sys.path.insert(0, sys.argv[1]); import toyc
for name,K in [('A w2333 d.5 r.25',dict(waves=[(25,2),(80,3),(135,3),(190,3)],dodge=0.5,reveal=0.25)),
               ('B w2334 d.45 r.25 sc1.5',dict(waves=[(25,2),(80,3),(135,3),(190,4)],dodge=0.45,reveal=0.25,w={'moored':4,'haul':3,'found':4,'transit':2,'scatter':1.5,'wing':1.5})),
               ('C w2344 d.45 r.3',dict(waves=[(25,2),(80,3),(135,4),(190,4)],dodge=0.45,reveal=0.3))]:
  print(name); print('\n'.join(toyc.table(False,K,300)))
