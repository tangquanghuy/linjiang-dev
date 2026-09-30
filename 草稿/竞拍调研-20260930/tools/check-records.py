from pathlib import Path
import re,json
root=Path.cwd()/'草稿'/'竞拍调研-20260930'
missing=[]
for p in root.glob('*.md'):
 for link in re.findall(r'\]\(([^)]+)\)',p.read_text(encoding='utf-8-sig')):
  if '://' not in link and not (p.parent/link.split('#')[0]).exists():missing.append((p.name,link))
print('Markdown local link failures:',missing)
rows=json.loads((root/'assets.json').read_text(encoding='utf-8'))
print('Originals:',len(rows),'Remote:',sum(r['source_id']!='P01' for r in rows),'Local:',sum(r['source_id']=='P01' for r in rows))
print('Research folder bytes:',sum(p.stat().st_size for p in root.rglob('*') if p.is_file()))
assert not missing
