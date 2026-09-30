"""Build an offline, source-labelled gallery and a checked image manifest."""
from pathlib import Path
from datetime import datetime, timezone
from PIL import Image, ImageDraw
import hashlib, html, json
ROOT=Path(__file__).resolve().parents[1]
rows=json.loads((ROOT/'assets.json').read_text(encoding='utf-8-sig'))
rows=[r for r in rows if r.get('source_id')!='P01']
meta={
 'nte-image-861-2048x1108':('活动入口 / 宣传构图','非竞拍操作画面。研究场景气氛与标题层级；不据此还原对局布局。','promotion'),
 'nte-official-poster':('官方活动海报','官方国服 2026-07-22 预告；宣传图，保留原日期文字。','promotion'),
 'nte-image-856':('活动奖励入口','图鉴、竞拍、收集与盈利任务分组；历史活动期界面。','game-ui'),
 'nte-image-858':('帮手选择 · 九原','左侧人物卡，右侧技能说明；高品质单件线索型。','game-ui'),
 'nte-image-857':('帮手选择 · 小吱','批量轮廓与延迟揭示；可观察选中态与确认按钮。','game-ui'),
 'nte-image-862':('帮手选择 · 达芙蒂尔','高品质数量统计；下方还能看到其他角色卡及锁定态。','game-ui'),
 'nte-image-850':('仪器组与角色配置摘要','这是局部裁图，不是完整仪器购买或配置面板。','game-ui'),
 'nte-image-853':('三档会场选择','验资门槛、入场费、锁定态；与货箱主题分开理解。','game-ui'),
 'nte-image-852':('竞拍主界面 · 第 1 回合','左：4 位竞拍者；中：回合与情报；右：估价与仓库；底：仪器与出价。','game-ui'),
 'nte-image-851':('藏品图鉴与条件筛选','左侧品质/品类/形状筛选，右侧候选物品和价格；仍保留对局上下文。','game-ui'),
 'nte-image-854':('结束页 · A 级盈利','成交 200,000，实际价值 296,653，收益 96,653；右侧藏品与出售入口。','game-ui'),
 'nte-image-855':('结束页 · B 级亏损','清晰区分最终成交价、实际价值和负收益；勿只看评级字母。','game-ui'),
 'nte-image-859':('结束页 · 其他玩家亏损','可见胜者亏损与旁观者奖励金分列；不从单图推导全部奖励规则。','game-ui'),
 'nte-image-860':('结束页 · S 级盈利','绿色收益、巨大评级、完整物品仓库与品质筛选。','game-ui'),
 'bidking-01':('收藏柜主界面','开发者商店截图；收藏成果放在主界面中心，右下竞拍入口。','store-ui'),
 'bidking-02':('竞拍主界面','左人、中情报、右仓库、底部出价；写实场景与荧黄操作点色。','store-ui'),
 'bidking-03':('竞拍大厅 / 会场地图','不同地点承载会场选择。','store-ui'),
 'bidking-04':('交易行','分类筛选、品质筛选和藏品价格卡。','store-ui'),
 'bidking-05':('竞买人选择','人物形象、背景、技能与角色列表分区。','store-ui'),
 'bidking-06':('个人信息与长期统计','战绩、收藏与维度统计；具体统计公式未验证。','store-ui')
}
for r in rows:
 title,note,kind=meta[r['id']]
 r.update(title=title,note=note,kind=kind,group='nte' if r['id'].startswith('nte-') else 'bidking')
 if kind=='promotion':r['type']='official-promotional-poster' if r['source_id']=='S01' else 'article-embedded-activity-presentation'
states={'setup':'仪器准备','bidding':'首箱竞拍主屏','keypad':'数字出价键盘','result':'首箱开箱结算','round':'第二箱入场','summary':'三箱总账'}
for p in sorted((ROOT/'images/project').glob('*.png')):
 im=Image.open(p);raw=p.read_bytes();stem=p.stem
 if stem=='lobby':title='大厅入口检查';note='访问 #auction 实际落到 shrine.html；图中不是竞拍游戏。'
 else:
  size,state=stem.split('-',1);title=f'{size} · {states.get(state,state)}'
  note='本地实拍；计时关闭，截图前等待动画 650ms。'+('文件名 round 指第二箱入场，不表示第二回合。' if state=='round' else '')
 rows.append(dict(id='project-'+stem,file=p.relative_to(ROOT).as_posix(),source_id='P01',source_page='../../arcade/index.html#auction' if stem=='lobby' else '../../arcade/auction.html?nolimit=1',type='local-project-screenshot',status='downloaded',width=im.width,height=im.height,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),retrieved_at=datetime.fromtimestamp(p.stat().st_mtime,timezone.utc).isoformat(),version_note='Local db75edc / engine 0.2.0; random session, not a golden deterministic snapshot',title=title,note=note,kind='project-ui',group='project'))
priority=['nte-image-852','nte-image-851','nte-image-860','nte-image-853','nte-image-858','nte-image-857','nte-image-862','nte-image-850','nte-image-854','nte-image-855','nte-image-859','nte-image-856','nte-image-861-2048x1108','nte-official-poster']
rows.sort(key=lambda r: (['nte','bidking','project'].index(r['group']), priority.index(r['id']) if r['id'] in priority else r['id']))
# Check every successfully downloaded asset instead of assuming extension implies an image.
for r in rows:
 if r['status']!='downloaded':continue
 p=ROOT/r['file'];raw=p.read_bytes();im=Image.open(p);im.verify()
 assert hashlib.sha256(raw).hexdigest()==r['sha256'],r['file']
(ROOT/'assets.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for group in ['nte','bidking','project']:
 selected=[r for r in rows if r['group']==group and r['status']=='downloaded']
 w,h=480,300;sheet=Image.new('RGB',(w*3,h*((len(selected)+2)//3)),(23,28,37));draw=ImageDraw.Draw(sheet)
 for i,r in enumerate(selected):
  im=Image.open(ROOT/r['file']).convert('RGB');im.thumbnail((w-16,h-40));x=i%3*w;y=i//3*h
  sheet.paste(im,(x+(w-im.width)//2,y+8));draw.text((x+8,y+h-27),r['id']+f"  {r['width']}x{r['height']}",fill='white')
 sheet.save(ROOT/'images'/f'{group}-contact-sheet.jpg',quality=90)
md=['# 图片索引','', '原始地址、尺寸、采集时间与 SHA-256 见 `assets.json`。点击图片文件可查看原图；图库入口 `gallery.html`。','', '| ID | 图片 | 尺寸 | 来源 / 类别 | 观察与限制 |','|---|---|---|---|---|']
for r in rows:
 if r['status']!='downloaded':continue
 md.append(f"| `{r['id']}` | [{r['title']}]({r['file']}) | {r['width']}×{r['height']} | {r['source_id']} / {r['kind']} | {r['note']} |")
md+=['','## 联系表','', '[异环](images/nte-contact-sheet.jpg) · [竞拍之王](images/bidking-contact-sheet.jpg) · [本项目](images/project-contact-sheet.jpg)','','联系表只为浏览生成；原图未裁切、去水印或重编码。']
(ROOT/'image-index.md').write_text('\n'.join(md)+'\n',encoding='utf-8')
data=json.dumps([r for r in rows if r['status']=='downloaded'],ensure_ascii=False).replace('</','<\\/')
page='''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>竞拍研究 · 界面资料库</title>
<style>
:root{color-scheme:dark;--bg:#11151b;--panel:#1b222c;--line:#343e4b;--text:#e9edf3;--muted:#9aaabc;--accent:#ffb15b}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.7 system-ui,"Microsoft YaHei",sans-serif}a{color:var(--accent)}header{padding:46px max(22px,calc((100vw - 1440px)/2));background:linear-gradient(120deg,#272016,#151e2a);border-bottom:1px solid var(--line)}.eyebrow{font-size:12px;color:var(--accent);letter-spacing:3px}h1{font-size:clamp(26px,4vw,44px);margin:6px 0 10px;letter-spacing:-1px}.lead{max-width:920px;color:#bcc7d6}.stats{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}.stat{background:#ffffff09;border:1px solid #ffffff16;border-radius:10px;padding:8px 16px}.stat strong{font-size:23px;color:#fff;margin-right:8px}nav{display:flex;flex-wrap:wrap;gap:16px;font-size:13px;margin-top:22px}.wrap{max-width:1484px;margin:auto;padding:24px 22px 56px}.toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;position:sticky;top:0;background:#11151bf2;padding:14px 0;z-index:2}.toolbar button{border:1px solid var(--line);background:var(--panel);color:var(--text);padding:9px 16px;border-radius:8px;cursor:pointer}.toolbar button[aria-pressed=true]{background:var(--accent);color:#17130f;border-color:var(--accent);font-weight:700}.count{margin-left:auto;color:var(--muted);font-size:13px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}.preview{overflow:hidden;flex:0 0 auto;border:0;padding:0;background:#0b0f14;cursor:zoom-in;width:100%;aspect-ratio:16/10;position:relative}.preview img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}.badge{position:absolute;top:10px;left:10px;border-radius:5px;background:#000c;color:#fff;padding:3px 8px;font-size:11px;pointer-events:none}.body{padding:16px;display:flex;flex-direction:column;flex:1}.card h2{font-size:17px;line-height:1.4;margin:0 0 8px}.card p{font-size:13px;color:#b2bfd0;margin:0 0 12px;min-height:44px}.meta{font-size:11px;color:var(--muted);overflow-wrap:anywhere;margin-top:auto}.links{display:flex;gap:16px;margin-top:10px;font-size:12px}.notice{border-left:3px solid var(--accent);background:#ffffff05;padding:12px 16px;margin-bottom:18px;color:#b9c5d4;font-size:13px}dialog{width:96vw;max-width:1600px;max-height:96vh;background:#10151e;color:white;border:1px solid var(--line);border-radius:12px;padding:16px}dialog::backdrop{background:#000d}.dialogtop{display:flex;align-items:center;gap:18px;margin-bottom:10px}.dialogtop strong{margin-right:auto}dialog button{background:#293544;color:white;border:1px solid #46576d;border-radius:6px;padding:6px 12px;cursor:pointer}.full{width:100%;height:72vh;object-fit:contain;background:#090c10}.caption{font-size:13px;color:#b8c5d4;margin-top:10px;overflow-wrap:anywhere}footer{margin-top:28px;color:var(--muted);font-size:12px}@media(max-width:1000px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.grid{grid-template-columns:1fr}.count{width:100%;margin:0}.wrap{padding:14px}.toolbar{position:static}.dialogtop{gap:6px}.dialogtop strong{font-size:13px}.full{height:65vh}}
</style></head><body><header><div class="eyebrow">AUCTION / REFERENCE ARCHIVE</div><h1>竞拍研究 · 界面资料库</h1><div class="lead">《异环》即刻落槌 ×《竞拍之王》× 临江街机原型。原图、来源与项目实拍分开保存。先看信息布局，再讨论规则与制作范围。</div><div class="stats"><div class="stat"><strong>20</strong>外部参考图</div><div class="stat"><strong>25</strong>项目实拍</div><div class="stat"><strong>4</strong>项目测试宽度</div></div><nav><a href="README.md">调研总览</a><a href="01-玩法调研.md">玩法记录</a><a href="02-界面拆解.md">布局拆解</a><a href="03-项目现状与改造清单.md">项目差距</a><a href="SOURCES.md">来源说明</a><a href="assets.json">原图清单</a></nav></header><main class="wrap"><div class="notice">版本提示：异环画面主要来自 2026 年 7 月历史攻略；2 张为活动入口/宣传构图，12 张为玩法 UI。竞拍之王为开发者商店素材。本项目图片来自本地运行，不是对标游戏截图。图像仅作内部设计研究。</div><div class="toolbar" role="group" aria-label="筛选图片"><button data-group="external" aria-pressed="true">外部参考</button><button data-group="nte" aria-pressed="false">异环</button><button data-group="bidking" aria-pressed="false">竞拍之王</button><button data-group="project" aria-pressed="false">当前项目</button><button data-group="all" aria-pressed="false">全部图片</button><span id="count" class="count" aria-live="polite"></span></div><section id="grid" class="grid" aria-label="截图卡片"></section><footer>原图权利归相应权利人。未使用生成图替代实机截图，未将宣传图标成游戏操作画面。归档日期按工作区香港时间 2026-09-30；逐图采集时间记录为 UTC。支持点击或键盘 Enter 打开，Esc 关闭，左右箭头换图。</footer></main><dialog id="viewer"><div class="dialogtop"><strong id="title"></strong><button id="prev" aria-label="上一张">←</button><button id="next" aria-label="下一张">→</button><button id="close">关闭 ×</button></div><img class="full" id="full" alt=""><div class="caption" id="caption"></div><div class="links"><a id="original" target="_blank" rel="noopener">打开原图</a><a id="source" target="_blank" rel="noopener">查看来源</a></div></dialog><script>
const ASSETS=__DATA__;
const labels={'nte':'异环','bidking':'竞拍之王','project':'当前项目'};
const kinds={'promotion':'活动 / 宣传','game-ui':'游戏 UI','store-ui':'官方商店图','project-ui':'本地实拍'};
const grid=document.querySelector('#grid'), viewer=document.querySelector('#viewer');let visible=[],index=0;
function openImage(i){index=(i+visible.length)%visible.length;const r=visible[index];document.querySelector('#title').textContent=r.title;const im=document.querySelector('#full');im.src=r.file;im.alt=r.title;document.querySelector('#caption').textContent=`${r.width} × ${r.height} · ${r.source_id} · ${r.note} ${r.version_note}`;document.querySelector('#original').href=r.file;document.querySelector('#source').href=r.source_page;if(!viewer.open)viewer.showModal();}
function render(group){visible=ASSETS.filter(r=>group==='all'||(group==='external'?r.group!=='project':r.group===group));grid.replaceChildren();visible.forEach((r,i)=>{const card=document.createElement('article');card.className='card';const preview=document.createElement('button');preview.className='preview';preview.setAttribute('aria-label','放大：'+r.title);const img=new Image();img.src=r.file;img.alt=r.title;img.loading='lazy';img.width=r.width;img.height=r.height;const badge=document.createElement('span');badge.className='badge';badge.textContent=labels[r.group]+' · '+kinds[r.kind];preview.append(img,badge);preview.onclick=()=>openImage(i);const body=document.createElement('div');body.className='body';const title=document.createElement('h2');title.textContent=r.title;const note=document.createElement('p');note.textContent=r.note;const meta=document.createElement('div');meta.className='meta';meta.textContent=`${r.id} · ${r.width}×${r.height} · ${r.source_id}`;const links=document.createElement('div');links.className='links';for(const [text,href] of [['原图',r.file],['来源页',r.source_page]]){const a=document.createElement('a');a.textContent=text;a.href=href;a.target='_blank';a.rel='noopener';links.append(a);}body.append(title,note,meta,links);card.append(preview,body);grid.append(card);});document.querySelector('#count').textContent=visible.length+' 张 · 点击放大 / 原图查看';document.querySelectorAll('[data-group]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.group===group)));}
document.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>render(b.dataset.group));document.querySelector('#close').onclick=()=>viewer.close();document.querySelector('#prev').onclick=()=>openImage(index-1);document.querySelector('#next').onclick=()=>openImage(index+1);viewer.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();openImage(index-1)}if(e.key==='ArrowRight'){e.preventDefault();openImage(index+1)}});viewer.addEventListener('click',e=>{if(e.target===viewer){const r=viewer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)viewer.close();}});render('external');
</script></body></html>'''
(ROOT/'gallery.html').write_text(page.replace('__DATA__',data),encoding='utf-8')
print(f"Checked {sum(r['status']=='downloaded' for r in rows)} original images; wrote manifest, index, 3 contact sheets and offline gallery.")
