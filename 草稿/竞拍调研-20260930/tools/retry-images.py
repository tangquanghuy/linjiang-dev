from pathlib import Path
import urllib.request, json, hashlib, io
from PIL import Image
from datetime import datetime, timezone
root=Path.cwd()/'草稿'/'竞拍调研-20260930'
p=root/'assets.json'; data=json.loads(p.read_text(encoding='utf-8'))
for r in data:
 if r['status']=='failed':
  try:
   req=urllib.request.Request(r['url'],headers={'User-Agent':'Mozilla/5.0','Referer':r['source_page']})
   raw=urllib.request.urlopen(req,timeout=90).read();im=Image.open(io.BytesIO(raw));im.load();(root/r['file']).write_bytes(raw)
   r.update(status='downloaded',width=im.width,height=im.height,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),retrieved_at=datetime.now(timezone.utc).isoformat());r.pop('error',None)
   print(r['id'],'OK')
  except Exception as e:print(str(e))
p.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
