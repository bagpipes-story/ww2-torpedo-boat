# 左に HEAD、右に新しい絵を同じ高さで並べる（最近傍）。python3 pair.py OUT H dirA dirB key...
import sys
from PIL import Image
out=sys.argv[1]; H=int(sys.argv[2]); da=sys.argv[3]; db=sys.argv[4]; keys=sys.argv[5:]
cols=[]
for k in keys:
    for d in (da,db):
        im=Image.open(f'{d}/{k}.png'); w=round(im.width*H/im.height); cols.append(im.resize((w,H),Image.NEAREST))
    cols.append(None)
W=sum((c.width+8) if c else 24 for c in cols)
s=Image.new('RGB',(W,H),(11,16,32)); x=0
for c in cols:
    if c is None: x+=24; continue
    s.paste(c,(x,0)); x+=c.width+8
s.save(out)
