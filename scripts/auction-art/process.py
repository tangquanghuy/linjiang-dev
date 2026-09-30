"""Split generated 4x3 alpha sheets into normalized, small-screen collectible icons.
Usage: python scripts/auction-art/process.py. Never uses old photorealistic sheet.
"""
from pathlib import Path
import json, hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from segment import extract_sheet
ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'artifacts/auction-v3/cel'; dest=ROOT/'arcade/assets/auction/items'; dest.mkdir(parents=True,exist_ok=True)
assets=json.loads((ROOT/'scripts/auction-art/catalog.json').read_text('utf8'))
report=[]
def seam(weights,expected,radius):
 a=max(1,round(expected-radius));b=min(len(weights)-1,round(expected+radius)); region=weights[a:b]
 low=float(region.min()); candidates=np.flatnonzero(region<=low+1)+a
 return int(min(candidates,key=lambda p:abs(p-expected)))
for sheet in sorted(set(x['sheet'] for x in assets)):
 path=source/sheet
 if not path.exists(): print('Pending:',sheet);continue
 im=Image.open(path).convert('RGBA');w,h=im.size
 if im.getchannel('A').getextrema()[0]==255: raise RuntimeError(sheet+': expected transparent alpha')
 extracted=extract_sheet(im)
 for obj in [x for x in assets if x['sheet']==sheet]:
  cut,bbox,componentArea=extracted[obj['cell']]
  box=bbox;edge=bbox[0]==0 or bbox[1]==0 or bbox[2]==w or bbox[3]==h
  if edge: print('SOURCE EDGE',obj['key'],bbox)
  cut.thumbnail((218,218),Image.Resampling.LANCZOS)
  out=Image.new('RGBA',(256,256));out.alpha_composite(cut,((256-cut.width)//2,(256-cut.height)//2))
  file=dest/(obj['key']+'.webp');out.save(file,'WEBP',quality=92,method=6,exact=True)
  report.append({'id':obj['id'],'key':obj['key'],'source':sheet,'sourceSize':[w,h],'cellBox':box,'cropBox':bbox,'touchesEdge':edge,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size})
try: font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',12);tiny=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',10)
except OSError:font=ImageFont.load_default();tiny=font
qualities=['寻常','精良','稀有','史诗','传说'];colors=['#adb7bf','#8ccb9a','#80bce8','#bb9bec','#ffbc61']
for size,label in [(96,'catalog-preview'),(48,'small-size-proof')]:
 cw,ch=(116,142) if size==96 else (92,91);canvas=Image.new('RGB',(12*cw,8*ch),'#1c2329');draw=ImageDraw.Draw(canvas)
 for obj in assets:
  file=dest/(obj['key']+'.webp')
  if not file.exists():continue
  icon=Image.open(file).convert('RGBA');icon.thumbnail((size,size),Image.Resampling.LANCZOS)
  x=obj['id']%12*cw;y=obj['id']//12*ch
  draw.rounded_rectangle((x+3,y+3,x+cw-3,y+ch-3),radius=6,fill='#283239',outline=colors[obj['quality']])
  canvas.paste(icon,(x+(cw-icon.width)//2,y+5),icon)
  draw.text((x+cw//2,y+size+7),obj['name'],font=font if size==96 else tiny,fill='#f0eee7',anchor='mt')
  draw.text((x+cw//2,y+size+26),qualities[obj['quality']],font=tiny,fill=colors[obj['quality']],anchor='mt')
 canvas.save(ROOT/f'artifacts/auction-v3/{label}.jpg',quality=94)
(ROOT/'scripts/auction-art/processed.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('Processed',len(report),'icons; edge flags',sum(x['touchesEdge'] for x in report))
hall=ROOT/'artifacts/auction-v3/hall.png'
if hall.exists(): Image.open(hall).convert('RGB').save(ROOT/'arcade/assets/auction/hall.webp','WEBP',quality=87,method=6)
