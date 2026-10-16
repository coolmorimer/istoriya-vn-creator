import {sceneOrder,sceneExits} from './storyGraph.js';
import {routeGraphEdges} from './edgeRouting.js';
export const MAP_NODE={width:230,height:126};
export function sceneMapIndex(project){
 const order=sceneOrder(project),owners=new Map(),exits=new Map(),edges=[];
 for(const chapter of project.chapters)for(const id of chapter.scenes)if(!owners.has(id))owners.set(id,chapter);
 order.forEach((id,index)=>{const list=sceneExits(project,id,{nextSceneId:order[index+1]});exits.set(id,list);edges.push(...list);});return {order,owners,exits,edges};
}
export function sceneMapPositions(project,ids,drag){return Object.fromEntries(ids.map((id,index)=>{const p=drag?.id===id?drag.position:project.scenes[id].mapPosition;return [id,Number.isFinite(p?.x)&&Number.isFinite(p?.y)?p:{x:50+index%3*300,y:50+Math.floor(index/3)*200}];}));}
export function graphView(bounds,scale,overscan=160){const zoom=Number.isFinite(scale)&&scale>0?scale:1;return {left:(bounds.left-overscan)/zoom,top:(bounds.top-overscan)/zoom,right:(bounds.left+bounds.width+overscan)/zoom,bottom:(bounds.top+bounds.height+overscan)/zoom};}
export function intersects(a,b){return a.left<=b.right&&a.right>=b.left&&a.top<=b.bottom&&a.bottom>=b.top;}
export function visibleGraphNodes(ids,positions,view,keep=[]){const pinned=new Set(keep);return ids.filter(id=>{const p=positions[id];return p&&(pinned.has(id)||intersects({left:p.x-14,right:p.x+MAP_NODE.width+14,top:p.y,bottom:p.y+MAP_NODE.height},view));});}
export function sceneMapRoutes(index,positions){const nodes=Object.entries(positions).map(([id,p])=>({id,...p,...MAP_NODE})),routes=routeGraphEdges(nodes,index.edges);return index.edges.map(item=>({item,geometry:routes.get(item.id)})).filter(e=>e.geometry);}
