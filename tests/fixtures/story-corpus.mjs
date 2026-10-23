import {orderedStoryScenes,storyStartScene,chapterEntry,targetScene} from '../../runtime/story-routing.mjs';
const scene=id=>({id,title:id,characters:[],images:[],actions:[]});
export function storyFixture(){return {schemaVersion:8,meta:{title:'Story contract'},scenes:{a:scene('a'),b:scene('b'),c:scene('c'),orphan:scene('orphan')},chapters:[{id:'first',scenes:['a','b'],entrySceneId:'b'},{id:'second',scenes:['c']}]};}
const esc=s=>s.replaceAll('~','~0').replaceAll('/','~1');
export function referenceStoryPlan(project,startSceneId=null,startActionId=null){
 const order=orderedStoryScenes(project),transitions=[];
 const link=(record,pointer,field='targetSceneId')=>{const cf=field.replace('SceneId','ChapterId'),chapter=cf!==field&&record[cf];if(!chapter&&!record[field])return;const sceneId=cf===field?record[field]:targetScene(project,record,field);transitions.push({pointer:pointer+'/'+field,destination:chapter?{kind:'chapter',chapterId:chapter,sceneId}:{kind:'scene',sceneId}});};
 for(const[id,s]of Object.entries(project.scenes)){
  const p='/scenes/'+esc(id);for(const[i,a]of(s.actions??[]).entries()){
   if(s.timelineEnabled&&a.timeline?.enabled===false)continue;
   const q=p+'/actions/'+i;if(a.type==='jump')link(a,q);if(a.type==='condition'){link(a,q,'trueSceneId');link(a,q,'falseSceneId');}if(a.type==='choice')for(const[j,o]of(a.options??[]).entries())link(o,q+'/options/'+j);
  }
  for(const[i,l]of(s.images??[]).entries())for(const[j,r]of(l.interactions??[]).entries())link(r,p+'/images/'+i+'/interactions/'+j);
 }
 if(project.rpg?.enabled){for(const[i,l]of(project.rpg.locations??[]).entries())link(l,'/rpg/locations/'+i,'sceneId');for(const[i,a]of(project.rpg.actors??[]).entries())for(const f of['talkSceneId','winSceneId','loseSceneId'])link(a,'/rpg/actors/'+i,f);}
 return {protocol:1,startSceneId:storyStartScene(project,startSceneId),startActionId:startActionId||null,sceneOrder:order,chapterEntries:Object.fromEntries((project.chapters??[]).filter(c=>c.id&&chapterEntry(project,c.id)).map(c=>[c.id,chapterEntry(project,c.id)])),nextScene:Object.fromEntries(order.map((id,i)=>[id,order[i+1]??null])),transitions};
}
export function storyCorpus(){
 const rows=[],add=(name,modify,extra={})=>{const project=storyFixture();modify?.(project);rows.push({name,project,...extra});};
 add('default chapter entry');add('explicit scene/action preview',p=>p.scenes.c.actions.push({id:'line',type:'narration',text:'QA'}),{startSceneId:'c',startActionId:'line'});
 add('priority typed chapter over stale scene',p=>p.scenes.a.actions.push({id:'j',type:'jump',targetChapterId:'second',targetSceneId:'gone'}));
 add('two condition branches',p=>p.scenes.a.actions.push({id:'if',type:'condition',trueChapterId:'first',falseSceneId:'c'}));
 add('optional prop reply and cross-chapter prop',p=>p.scenes.a.images.push({id:'door',interactions:[{id:'reply',text:'LITERAL [text] {text}'},{id:'open',targetChapterId:'second'}]}));
 add('RPG world links',p=>p.rpg={enabled:true,locations:[{sceneId:'c'}],actors:[{talkSceneId:'b',winSceneId:'a',loseSceneId:'orphan'}]});
 add('UTF16 numeric and Unicode order',p=>{for(const id of['2','10','😀','\ue000','~/','chapter:second'])p.scenes[id]=scene(id);});
 add('disabled timed malformed link',p=>{p.scenes.a.timelineEnabled=true;p.scenes.a.actions=[{id:'j',type:'jump',targetChapterId:'missing',timeline:{enabled:false}}];});
 add('legacy anonymous chapters and scene',p=>{delete p.chapters[0].id;delete p.scenes.a.id;});
 add('repeated membership is deduplicated',p=>p.chapters[1].scenes.unshift('b'));
 add('empty first chapter',p=>p.chapters.unshift({id:'empty',scenes:[]}));
 for(const[field,code]of[['targetSceneId','story.target-scene-missing'],['targetChapterId','story.target-chapter-missing']])add('missing '+field,p=>p.scenes.a.actions.push({id:'j',type:'jump',[field]:'gone'}),{error:code,pointer:'/scenes/a/actions/0/'+field});
 add('required unlinked jump',p=>p.scenes.a.actions.push({id:'j',type:'jump'}),{error:'story.target-empty',pointer:'/scenes/a/actions/0/targetSceneId'});
 add('required unlinked choice',p=>p.scenes.a.actions.push({id:'j',type:'choice',options:[{}]}),{error:'story.target-empty',pointer:'/scenes/a/actions/0/options/0/targetSceneId'});
 add('empty choice',p=>p.scenes.a.actions.push({id:'j',type:'choice',options:[]}),{error:'story.choice-empty',pointer:'/scenes/a/actions/0/options'});
 add('missing condition arm',p=>p.scenes.a.actions.push({id:'if',type:'condition',trueSceneId:'b'}),{error:'story.target-empty',pointer:'/scenes/a/actions/0/falseSceneId'});
 add('missing chapter member',p=>p.chapters[0].scenes[0]='gone',{error:'story.chapter-scene-missing',pointer:'/chapters/0/scenes/0'});
 add('entry outside chapter',p=>p.chapters[0].entrySceneId='c',{error:'story.chapter-entry-missing',pointer:'/chapters/0/entrySceneId'});
 add('duplicate chapter ID',p=>p.chapters[1].id='first',{error:'story.duplicate-chapter',pointer:'/chapters/1/id'});
 add('stale preview scene',null,{startSceneId:'gone',error:'story.preview-scene-missing',pointer:'/scenes'});
 add('stale preview step',null,{startSceneId:'b',startActionId:'gone',error:'story.preview-action-missing',pointer:'/scenes/b/actions'});
 add('enabled missing world scene',p=>p.rpg={enabled:true,locations:[{sceneId:'gone'}]},{error:'story.target-scene-missing',pointer:'/rpg/locations/0/sceneId'});
 add('missing prop chapter',p=>p.scenes.a.images=[{id:'p',interactions:[{id:'r',targetChapterId:'gone',targetSceneId:'b'}]}],{error:'story.target-chapter-missing',pointer:'/scenes/a/images/0/interactions/0/targetChapterId'});
 // Deterministic generated topologies, not tests of a fake SDK.
 let seed=0x183754;const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let i=0;i<400;i++)add('generated-'+i,p=>{
  const ids=['a','b','c','orphan'];if(i%3===0){p.scenes['chapter:second']=scene('chapter:second');ids.push('chapter:second');}
  p.chapters[0].entrySceneId=['a','b'][rand(2)];p.chapters[1].scenes=i%2?['c','orphan']:['c'];
  for(const id of ids){const s=p.scenes[id],pick=()=>rand(2)?{targetChapterId:rand(2)?'first':'second',targetSceneId:'STALE'}:{targetSceneId:ids[rand(ids.length)]};s.actions=[{id:'line',type:'narration',text:'Not part of navigation '+i},{id:'choice',type:'choice',options:Array.from({length:1+rand(5)},(_,j)=>({id:'o'+j,...pick()}))}];s.images=[{id:'prop',interactions:[{id:'reaction',...pick()}]}];if(i%5===0){s.timelineEnabled=true;s.actions.unshift({id:'disabled',type:'jump',targetSceneId:'missing',timeline:{enabled:false}});}}
 });
 return rows;
}
