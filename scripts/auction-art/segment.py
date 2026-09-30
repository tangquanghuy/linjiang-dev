"""Connected-component extraction; sheet cells guide ordering, never cut through art."""
import numpy as np
from PIL import Image, ImageFilter

def extract_sheet(im):
 a=np.asarray(im.getchannel('A')); mask=a>20;h,w=mask.shape
 parent=[];runs=[];previous=[]
 def root(i):
  while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
  return i
 def union(a,b):
  a,b=root(a),root(b)
  if a!=b:parent[b]=a
  return a
 for y in range(h):
  changes=np.diff(np.concatenate(([0],mask[y].astype(np.int8),[0])))
  starts=np.flatnonzero(changes==1);ends=np.flatnonzero(changes==-1);current=[];j=0
  for l,r in zip(starts,ends):
   while j<len(previous) and previous[j][1]<l:j+=1
   overlapping=[];k=j
   while k<len(previous) and previous[k][0]<=r:
    overlapping.append(previous[k][2]);k+=1
   if overlapping:
    label=root(overlapping[0])
    for other in overlapping[1:]:label=union(label,other)
   else:label=len(parent);parent.append(label)
   current.append((int(l),int(r),label));runs.append((y,int(l),int(r),label))
  previous=current
 stats={}
 for y,l,r,label in runs:
  label=root(label)
  if label not in stats:stats[label]=[0,w,h,0,0]
  s=stats[label];s[0]+=r-l;s[1]=min(s[1],l);s[2]=min(s[2],y);s[3]=max(s[3],r);s[4]=max(s[4],y+1)
 largest=sorted(stats,key=lambda k:stats[k][0],reverse=True)[:12]
 if len(largest)!=12:raise RuntimeError('Expected 12 primary connected objects')
 center=lambda k:((stats[k][1]+stats[k][3])/2,(stats[k][2]+stats[k][4])/2)
 rows=sorted(largest,key=lambda k:center(k)[1]);ordered=[]
 for r in range(3):ordered+=sorted(rows[r*4:r*4+4],key=lambda k:center(k)[0])
 groups={}
 for label,s in stats.items():
  if s[0]<18:continue
  x,y=center(label)
  groups[label]=min(range(12),key=lambda i:((x-center(ordered[i])[0])/(w/4))**2+((y-center(ordered[i])[1])/(h/3))**2)
 masks=[np.zeros((h,w),dtype=np.uint8) for _ in range(12)]
 for y,l,r,label in runs:
  group=groups.get(root(label))
  if group is not None:masks[group][y,l:r]=255
 result=[]
 for i,m in enumerate(masks):
  # Preserve native edge alpha in a 1px halo, without importing neighboring art.
  expanded=np.asarray(Image.fromarray(m).filter(ImageFilter.MaxFilter(3)))>0
  alpha=np.where(expanded,a,0).astype(np.uint8)
  cut=im.copy();cut.putalpha(Image.fromarray(alpha));bbox=cut.getbbox()
  result.append((cut.crop(bbox),bbox,int(stats[ordered[i]][0])))
 return result
