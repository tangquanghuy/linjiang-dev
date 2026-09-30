"""Download reference images; run with Python 3 + Pillow. Originals stay unedited."""
from pathlib import Path
from html.parser import HTMLParser
import urllib.request, json, hashlib, concurrent.futures, io
from datetime import datetime, timezone
from PIL import Image, ImageOps, ImageDraw
ROOT = Path(__file__).resolve().parents[1]
GUIDE='https://www.enjoygm.com/zh-TW/blog/neverness-to-everness/nte-going-going-gone-event-guide'
STEAM='https://store.steampowered.com/app/4128580/'
API='https://store.steampowered.com/api/appdetails?appids=4128580&l=schinese'
def get(url, referer=None):
    h={'User-Agent':'Mozilla/5.0'}
    if referer: h['Referer']=referer
    with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=35) as r:return r.read()
class Parser(HTMLParser):
    def __init__(self):super().__init__();self.images=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='img' and 'wp-image' in a.get('class',''):self.images.append(a)
p=Parser();p.feed(get(GUIDE).decode('utf-8'))
jobs=[]
for a in p.images:
    url=a['src']
    # The main page publishes a higher-resolution variant in srcset.
    if a.get('srcset'):
        candidates=[x.strip().split() for x in a['srcset'].split(',')]
        url=max(candidates,key=lambda c:int(c[1].rstrip('w')))[0]
    name=url.rsplit('/',1)[1]
    jobs.append({'id':'nte-'+name.split('.')[0], 'file':'images/nte/'+name, 'url':url,'source_id':'S04','source_page':GUIDE,'type':'article-embedded-game-screenshot','version_note':'July 2026 activity guide; not verified as September UI'})
steam=json.loads(get(API))['4128580']['data']
for a in steam['screenshots']:
    jobs.append({'id':f"bidking-{a['id']+1:02}",'file':f"images/bidking/steam-{a['id']+1:02}.jpg",'url':a['path_full'],'source_id':'S05','source_page':STEAM,'type':'developer-published-store-screenshot','version_note':'Store media downloaded 2026-09-30; build version unspecified'})
jobs.append({'id':'nte-official-poster','file':'images/nte/official-activity-poster.jpg','url':'https://img2-tc.tapimg.com/moment/etag/FmAjC3aGbUnCA0g0SF7mgmqA2tkE_20260722095924.jpg/_tap_ugc.jpg','source_id':'S01','source_page':'https://www.taptap.cn/moment/828932198156471051?group_id=805079','type':'official-promotional-poster','version_note':'2026-07-22 announcement; not a live gameplay capture'})
def download(j):
    try:
        data=get(j['url'],j['source_page'])
        im=Image.open(io.BytesIO(data));im.load()
        path=ROOT/j['file'];path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
        return dict(j,status='downloaded',width=im.width,height=im.height,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),retrieved_at=datetime.now(timezone.utc).isoformat())
    except Exception as e:return dict(j,status='failed',error=str(e))
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:results=list(ex.map(download,jobs))
(ROOT/'assets.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
for group in ['nte','bidking']:
    images=[r for r in results if r['status']=='downloaded' and r['file'].startswith('images/'+group+'/')]
    w,h=480,300;sheet=Image.new('RGB',(w*3,h*((len(images)+2)//3)),(23,28,37));d=ImageDraw.Draw(sheet)
    for i,r in enumerate(images):
        im=Image.open(ROOT/r['file']).convert('RGB');im.thumbnail((w-16,h-40))
        x=(i%3)*w;y=(i//3)*h;sheet.paste(im,(x+(w-im.width)//2,y+8))
        d.text((x+8,y+h-27),r['id']+'  '+str(r['width'])+'x'+str(r['height']),fill='white')
    sheet.save(ROOT/'images'/f'{group}-contact-sheet.jpg',quality=91)
print(json.dumps([{k:r[k] for k in ['id','status','width','height','error'] if k in r} for r in results],indent=2))
