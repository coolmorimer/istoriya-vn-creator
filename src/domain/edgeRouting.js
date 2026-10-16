// Fixed-position editor routing only. No project fields or runtime exits change.
const EPS=1e-6,CELL=128;
const box=node=>({id:node.id,left:node.x,right:node.x+node.width,top:node.y,bottom:node.y+node.height});
const overlap=(a,b)=>a.left<b.right-EPS&&a.right>b.left+EPS&&a.top<b.bottom-EPS&&a.bottom>b.top+EPS;
export function segmentCrossesRect(a,b,r){
 if(Math.abs(a.x-b.x)<EPS)return a.x>r.left+EPS&&a.x<r.right-EPS&&Math.max(a.y,b.y)>r.top+EPS&&Math.min(a.y,b.y)<r.bottom-EPS;
 if(Math.abs(a.y-b.y)<EPS)return a.y>r.top+EPS&&a.y<r.bottom-EPS&&Math.max(a.x,b.x)>r.left+EPS&&Math.min(a.x,b.x)<r.right-EPS;
 return overlap({left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),top:Math.min(a.y,b.y),bottom:Math.max(a.y,b.y)},r);
}
class SpatialIndex {
 constructor(rects=[]){this.rects=[];this.cells=new Map();for(const r of rects)this.add(r);}
 add(r){const i=this.rects.push(r)-1;for(let x=Math.floor(r.left/CELL);x<=Math.floor(r.right/CELL);x++)for(let y=Math.floor(r.top/CELL);y<=Math.floor(r.bottom/CELL);y++){const key=`${x}:${y}`,list=this.cells.get(key)??[];list.push(i);this.cells.set(key,list);}}
 query(r){const x0=Math.floor(r.left/CELL),x1=Math.floor(r.right/CELL),y0=Math.floor(r.top/CELL),y1=Math.floor(r.bottom/CELL);if((x1-x0+1)*(y1-y0+1)>4096)return this.rects;const ids=new Set();for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(const i of this.cells.get(`${x}:${y}`)??[])ids.add(i);return [...ids].map(i=>this.rects[i]);}
 segment(a,b,ignore){return this.query({left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),top:Math.min(a.y,b.y),bottom:Math.max(a.y,b.y)}).some(r=>!(ignore instanceof Set?ignore.has(r.id):r.id===ignore)&&segmentCrossesRect(a,b,r));}
 occupied(r){return this.query(r).some(other=>overlap(r,other));}
}
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
function compact(points){const out=[];for(const p of points){if(out.length&&distance(out.at(-1),p)<EPS)continue;while(out.length>1){const a=out.at(-2),b=out.at(-1);if((a.x===b.x&&b.x===p.x&&(b.y-a.y)*(p.y-b.y)>=0)||(a.y===b.y&&b.y===p.y&&(b.x-a.x)*(p.x-b.x)>=0))out.pop();else break;}out.push(p);}return out;}
function clear(points,index,from,to){return points.slice(1).every((p,i)=>{const a=points[i],ignore=new Set();if(i===0&&p.y===a.y&&p.x>=a.x)ignore.add(from);if(i===points.length-2&&p.y===a.y&&a.x<=p.x)ignore.add(to);return !index.segment(a,p,ignore);});}
const score=points=>points.slice(1).reduce((total,p,i)=>total+distance(points[i],p)+(i>0?16:0),0);
class Heap {
 constructor(){this.items=[];this.serial=0;}
 push(value){value.serial=this.serial++;const a=this.items;let i=a.push(value)-1;while(i){const p=(i-1)>>>1;if(a[p].f<value.f||(a[p].f===value.f&&a[p].serial<value.serial))break;a[i]=a[p];i=p;}a[i]=value;}
 pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&(a[child+1].f<a[child].f||(a[child+1].f===a[child].f&&a[child+1].serial<a[child].serial)))child++;if(last.f<a[child].f||(last.f===a[child].f&&last.serial<a[child].serial))break;a[i]=a[child];i=child;}a[i]=last;}return first;}
}
const sorted=values=>[...new Set(values.filter(n=>Number.isFinite(n)&&n>=0))].sort((a,b)=>a-b);
function search(start,goal,index,coordinates){
 const xs=sorted([...coordinates.xs,start.x,goal.x]),ys=sorted([...coordinates.ys,start.y,goal.y]),sx=xs.indexOf(start.x),sy=ys.indexOf(start.y),gx=xs.indexOf(goal.x),gy=ys.indexOf(goal.y),heap=new Heap(),known=new Map();
 const key=(x,y,d)=>`${x}:${y}:${d}`,initial={x:sx,y:sy,dir:0,g:0,f:distance(start,goal),parent:null};initial.key=key(sx,sy,0);heap.push(initial);known.set(initial.key,initial);
 let visits=0;while(heap.items.length&&visits++<32000){const current=heap.pop();if(known.get(current.key)!==current)continue;if(current.x===gx&&current.y===gy){const points=[];for(let c=current;c;c=c.parent)points.push({x:xs[c.x],y:ys[c.y]});return compact(points.reverse());}
  for(const [dx,dy,dir]of [[1,0,1],[-1,0,1],[0,1,2],[0,-1,2]]){const x=current.x+dx,y=current.y+dy;if(x<0||y<0||x>=xs.length||y>=ys.length)continue;const a={x:xs[current.x],y:ys[current.y]},b={x:xs[x],y:ys[y]};if(index.segment(a,b,null))continue;const g=current.g+distance(a,b)+(current.dir&&current.dir!==dir?16:0),k=key(x,y,dir);if((known.get(k)?.g??Infinity)<=g)continue;const next={x,y,dir,g,f:g+distance(b,goal),parent:current,key:k};known.set(k,next);heap.push(next);}
 }return null;
}
function context(nodes,padding){const rects=nodes.map(n=>{const r=box(n);return {...r,left:Math.min(r.left-2,Math.max(2,r.left-padding)),top:Math.min(r.top-2,Math.max(2,r.top-padding)),right:r.right+padding,bottom:r.bottom+padding};}),index=new SpatialIndex(rects);return {index,coordinates:{xs:sorted([0,...rects.flatMap(r=>[r.left-1,r.right+1])]),ys:sorted([0,...rects.flatMap(r=>[r.top-1,r.bottom+1])])}};}
function route(edge,from,to,offset,targetOffset,ctx,padding){
 const a={x:from.x+from.width,y:from.y+from.height/2+offset},b={x:to.x,y:to.y+to.height/2+targetOffset},start={x:a.x+padding+6,y:a.y},goal={x:Math.max(0,b.x-padding-6),y:b.y},middle=(start.x+goal.x)/2;
 if(ctx.index.segment(a,start,from.id)||ctx.index.segment(goal,b,to.id))return null;
 const candidates=[
  [a,start,{x:middle,y:start.y},{x:middle,y:goal.y},goal,b],
  ...[Math.max(0,Math.min(from.y,to.y)-padding-6),Math.max(from.y+from.height,to.y+to.height)+padding+6,Math.max(0,from.y-padding-6),from.y+from.height+padding+6,Math.max(0,to.y-padding-6),to.y+to.height+padding+6].map(y=>[a,start,{x:start.x,y},{x:goal.x,y},goal,b]),
 ];
 const room=points=>{const width=Math.max(36,Array.from(String(edge.label??'Переход')).slice(0,22).length*7+16);return points.slice(1).some((p,i)=>{const x=(p.x+points[i].x)/2,y=(p.y+points[i].y)/2;return !ctx.body.occupied({left:x-width/2,right:x+width/2,top:y-11,bottom:y+11});});};
 const valid=candidates.map(compact).filter(points=>clear(points,ctx.index,edge.from,edge.to));if(valid.length)return valid.sort((a,b)=>(score(a)+(room(a)?0:300))-(score(b)+(room(b)?0:300)))[0];const found=search(start,goal,ctx.index,ctx.coordinates);return found?compact([a,...found,b]):null;
}
function rounded(points,radius){let d=`M${points[0].x},${points[0].y}`;for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1],r=Math.min(radius,distance(a,b)/2,distance(b,c)/2),p={x:b.x+Math.sign(a.x-b.x)*r,y:b.y+Math.sign(a.y-b.y)*r},q={x:b.x+Math.sign(c.x-b.x)*r,y:b.y+Math.sign(c.y-b.y)*r};d+=` L${p.x},${p.y} Q${b.x},${b.y} ${q.x},${q.y}`;}const last=points.at(-1);return d+` L${last.x},${last.y}`;}
function label(points,text,nodeIndex,labelIndex,outerRight,sequence){
 const short=Array.from(String(text??'Переход')).slice(0,22).join(''),width=Math.max(36,short.length*7+16),height=22,segments=points.slice(1).map((b,i)=>({a:points[i],b,length:distance(points[i],b)})).sort((a,b)=>b.length-a.length);
 const free=(x,y,anchor)=>{const rect={left:x-width/2,right:x+width/2,top:y-height/2,bottom:y+height/2};if(rect.left<0||rect.top<0||nodeIndex.occupied(rect)||labelIndex.occupied(rect)||(anchor&&nodeIndex.segment(anchor,{x,y},null)))return null;labelIndex.add(rect);return {x,y,width,height,text:short,rect,anchor};};
 for(const {a,b}of segments)for(const t of [.5,.35,.65,.2,.8])for(const shift of [0,-26,26,-52,52]){const anchor={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},x=anchor.x+(a.x===b.x?shift:0),y=anchor.y+(a.y===b.y?shift:0),result=free(x,y,anchor);if(result)return result;}
 // Dense labels move to a clear external lane, never silently over a card.
 let y=Math.max(14,points[0].y+sequence*26),result;while(!(result=free(outerRight+width/2+24,y)))y+=26;return result;
}
export function routeGraphEdges(nodes,edges){
 const valid=nodes.filter(n=>n&&Number.isFinite(n.x)&&Number.isFinite(n.y)&&Number.isFinite(n.width)&&Number.isFinite(n.height)&&n.width>0&&n.height>0),byId=new Map(valid.map(n=>[n.id,n])),main=context(valid,16),nodeIndex=new SpatialIndex(valid.map(n=>{const r=box(n);return {...r,left:r.left-2,right:r.right+2,top:r.top-2,bottom:r.bottom+2};})),labelIndex=new SpatialIndex(),outgoing=new Map(),incoming=new Map(),result=new Map();main.body=nodeIndex;let tight;
 for(const edge of edges){for(const [map,id]of [[outgoing,edge.from],[incoming,edge.to]]){const list=map.get(id)??[];list.push(edge);map.set(id,list);}}
 const offset=(list,edge,height)=>{const i=list.findIndex(e=>e.id===edge.id);return list.length<2?0:(i/(list.length-1)-.5)*Math.min(height*.6,(list.length-1)*16);},outerRight=Math.max(0,...valid.map(n=>n.x+n.width));
 edges.forEach((edge,sequence)=>{const from=byId.get(edge.from),to=byId.get(edge.to);if(!from||!to)return;const a=offset(outgoing.get(edge.from),edge,from.height),b=offset(incoming.get(edge.to),edge,to.height);let points=route(edge,from,to,a,b,main,16),radius=4;if(!points){tight??=context(valid,8);tight.body=nodeIndex;points=route(edge,from,to,a,b,tight,8);radius=0;}const blocked=!points;if(!points)points=[{x:from.x+from.width,y:from.y+from.height/2+a},{x:to.x,y:to.y+to.height/2+b}];
  const tag=label(points,edge.label,nodeIndex,labelIndex,outerRight,sequence),bounds={left:Math.min(tag.rect.left,...points.map(p=>p.x))-10,right:Math.max(tag.rect.right,...points.map(p=>p.x))+10,top:Math.min(tag.rect.top,...points.map(p=>p.y))-10,bottom:Math.max(tag.rect.bottom,...points.map(p=>p.y))+10};
  result.set(edge.id,{d:blocked?`M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`:rounded(points,radius),points,blocked,labelX:tag.x,labelY:tag.y+4,labelBox:tag.rect,labelText:tag.text,labelLeader:tag.anchor&&distance(tag.anchor,tag)>EPS?`M${tag.anchor.x},${tag.anchor.y} L${tag.x},${tag.y}`:null,bounds});
 });return result;
}
export function graphContentBounds(nodes,routes){let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;for(const r of [...nodes.map(box),...routes].filter(Boolean)){const b=r.bounds??r;left=Math.min(left,b.left);top=Math.min(top,b.top);right=Math.max(right,b.right);bottom=Math.max(bottom,b.bottom);}return Number.isFinite(left)?{left:Math.max(0,left),top:Math.max(0,top),right,bottom}:{left:0,top:0,right:0,bottom:0};}
