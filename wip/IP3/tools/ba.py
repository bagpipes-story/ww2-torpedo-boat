# 上が HEAD・下が IP3 の tight の切り抜きを同じ大きさ（ピクセル幅 PW）に揃えて並べる。python3 ba.py OUT PW headdir newdir name...
import sys
from PIL import Image
out=sys.argv[1]; PW=int(sys.argv[2]); a=sys.argv[3]; b=sys.argv[4]; names=sys.argv[5:]
rows=[]
for d in (a,b):
    row=[]
    for n in names:
        im=Image.open(f'{d}/{n}-tight.png').convert('RGB'); h=round(im.height*PW/im.width); row.append(im.resize((PW,h),Image.NEAREST))
    rows.append(row)
H=max(i.height for r in rows for i in r)
s=Image.new('RGB',(len(names)*(PW+8),2*(H+8)),(60,60,60))
for ri,r in enumerate(rows):
    for ci,im in enumerate(r): s.paste(im,(ci*(PW+8),ri*(H+8)))
s.save(out)
