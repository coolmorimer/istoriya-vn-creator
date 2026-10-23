// A checked native IPC plan, not an alternate authoring document. Only parent
// records of resolved links are copied; media and unchanged branches are shared.
export function applyNativeStoryPlan(source,plan) {
  const fail=()=>{throw Error('План переходов Rust повреждён. Повторите сборку.');};
  const scenes=source.scenes??{},isScene=id=>typeof id==='string'&&Object.hasOwn(scenes,id);
  if(plan?.protocol!==1||!isScene(plan.startSceneId)||!Array.isArray(plan.sceneOrder)||plan.sceneOrder.length!==Object.keys(scenes).length||plan.sceneOrder.some(id=>!isScene(id))||new Set(plan.sceneOrder).size!==plan.sceneOrder.length||!Array.isArray(plan.transitions)||!plan.nextScene||typeof plan.nextScene!=='object'||Array.isArray(plan.nextScene))fail();
  if(Object.keys(plan.nextScene).length!==plan.sceneOrder.length||plan.sceneOrder.some(id=>!Object.hasOwn(plan.nextScene,id)||(plan.nextScene[id]!==null&&!isScene(plan.nextScene[id]))))fail();
  if(plan.startActionId!==null&&(typeof plan.startActionId!=='string'||!(scenes[plan.startSceneId].actions??[]).some(a=>a.id===plan.startActionId)))fail();
  const project={...source},clones=new Map([['',project]]);
  const write=(tokens,value)=>{
    let original=source,copy=project,key='';
    for(const token of tokens.slice(0,-1)){
      if(!original||typeof original!=='object'||!Object.hasOwn(original,token))fail();
      original=original[token];key+='/'+token.replaceAll('~','~0').replaceAll('/','~1');
      if(!original||typeof original!=='object')fail();
      let child=clones.get(key);
      if(!child){child=Array.isArray(original)?[...original]:{...original};clones.set(key,child);}
      Object.defineProperty(copy,token,{value:child,enumerable:true,configurable:true,writable:true});copy=child;
    }
    if(!copy||typeof copy!=='object'||Array.isArray(copy))fail();
    Object.defineProperty(copy,tokens.at(-1),{value,enumerable:true,configurable:true,writable:true});
  };
  for(const route of plan.transitions){
    const destination=route?.destination;
    if(!['scene','chapter'].includes(destination?.kind)||!isScene(destination.sceneId)||(destination.kind==='chapter'&&typeof destination.chapterId!=='string')||typeof route.pointer!=='string'||!/^\/(?:scenes|rpg)\//.test(route.pointer)||/~(?![01])/.test(route.pointer))fail();
    const tokens=route.pointer.split('/').slice(1).map(t=>t.replaceAll('~1','/').replaceAll('~0','~'));
    if(!['targetSceneId','trueSceneId','falseSceneId','sceneId','talkSceneId','winSceneId','loseSceneId'].includes(tokens.at(-1)))fail();
    write(tokens,destination.sceneId);
  }
  for(const id of plan.sceneOrder)if(!scenes[id].id)write(['scenes',id,'id'],id);
  return {project,startSceneId:plan.startSceneId,startActionId:plan.startActionId,nextScene:plan.nextScene};
}
