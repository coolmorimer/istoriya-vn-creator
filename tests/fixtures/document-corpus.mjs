import {defaultGameUi,MENU_ACTIONS} from '../../runtime/game-ui.mjs';
import {PAUSE_ACTIONS} from '../../runtime/system-ui.mjs';
export function documentCorpus(){
  const base=()=>({schemaVersion:8,meta:{title:'Документ'},scenes:{s:{id:'s',title:'Начало',characters:[],images:[],actions:[]}},characters:[],chapters:[{id:'ch',scenes:['s']}],resources:[],variables:[],flags:[],items:[]});
  const cases=[];const add=(name,edit,ok=true,extra={})=>{const project=base();edit(project);cases.push({name,project,ok,...extra});};
  for(let n=1;n<=8;n++){add('schema-'+n,p=>p.schemaVersion=n);add('schema-string-'+n,p=>p.schemaVersion=String(n));}
  for(const [name,version]of [['null',null],['zero',0],['empty',''],['boolean',true],['hex','0x8'],['binary','0b1000'],['octal','0o10'],['array',[8]],['nested-array',[[8]]],['legacy-unknown','legacy'],['fraction',7.5],['bom','\uFEFF8\uFEFF']])add('legacy-schema-'+name,p=>p.schemaVersion=version);
  add('missing-schema',p=>delete p.schemaVersion);add('unknown-data',p=>{p.future={deep:[1,null,{x:'[не код] {не шаблон}'}]};p.resources=[{id:'media',source:'data:image/png;base64,'+'x'.repeat(65536)}];p.scenes.s.characters=[{x:-120.0,y:160.0,width:50.5,opacity:0}];p.scenes.s.actions=[{id:'a',type:'narration',text:'C:/буквальный путь\n[]{}\\',future:{keep:true}}];});
  add('schema-opaque-object',p=>p.schemaVersion={legacy:true});add('schema-noncallable-primitive',p=>p.schemaVersion={toString:null},false);add('schema-nested-noncallable-primitive',p=>p.schemaVersion=[[{toString:1}]],false);
  for(const version of [9,'9','Infinity','1e309','0x100'])add('future-'+version,p=>p.schemaVersion=version,false,{pointer:'/schemaVersion'});
  for(const key of ['characters','resources','chapters','variables','flags','items']){
    for(const bad of [{},[null],[1],[[]]])add('list-'+key+'-'+JSON.stringify(bad),p=>p[key]=bad,false);
    add('nullable-'+key,p=>p[key]=null);
  }
  add('missing-meta',p=>delete p.meta);add('meta-type',p=>p.meta=[],false);add('title-type',p=>p.meta.title=3,false,{pointer:'/meta/title'});
  add('empty-scenes',p=>p.scenes={});add('missing-scenes',p=>delete p.scenes,false);add('scenes-array',p=>p.scenes=[],false);
  add('scene-null',p=>p.scenes.s=null,false);add('scene-title',p=>p.scenes.s.title={},false);add('scene-id-mismatch',p=>p.scenes.s.id='other',false);add('scene-empty-id-legacy',p=>p.scenes.s.id='');
  for(const id of ['__proto__','constructor','prototype'])add('reserved-scene-'+id,p=>p.scenes=JSON.parse(JSON.stringify({[id]:{actions:[]}})),false);
  for(const key of ['characters','images','actions']){add('scene-list-'+key,p=>p.scenes.s[key]=[null],false);add('scene-nullable-'+key,p=>p.scenes.s[key]=null);}
  for(const type of [null,1,{},[]])add('action-type-'+JSON.stringify(type),p=>p.scenes.s.actions=[{id:'a',type}],false,{pointer:'/scenes/s/actions/0/type'});
  add('unknown-action-preserved',p=>p.scenes.s.actions=[{type:'future-action',future:[1,2]}]);
  for(const key of ['text','prompt'])add('action-'+key,p=>p.scenes.s.actions=[{type:'narration',[key]:3}],false);
  add('options-list',p=>p.scenes.s.actions=[{type:'choice',options:[null]}],false);add('option-effects',p=>p.scenes.s.actions=[{type:'choice',options:[{effects:[null]}]}],false);
  add('unlinked-draft',p=>p.scenes.s.actions=[{type:'choice',options:[{text:'Позже',targetSceneId:'missing'}]}]);
  for(const id of ['',null,1,'__proto__','constructor','prototype'])add('inventory-id-'+id,p=>p.items=[{id}],false);
  add('inventory-duplicate',p=>p.items=[{id:'x'},{id:'x'}],false,{pointer:'/items/1/id'});add('inventory-name',p=>p.items=[{id:'x',name:4}],false);add('inventory-description',p=>p.items=[{id:'x',description:[]}],false);
  add('prop-anonymous-legacy',p=>p.scenes.s.images=[{source:'old.png'}]);
  for(const [name,reactions]of [['valid',[{id:'look',label:'Осмотреть',text:'Ответ'}]],['list-bad',[null]],['duplicate',[{id:'look'},{id:'look'}]],['bad-label',[{id:'look',label:5}]],['bad-reply',[{id:'look',text:{}}]],['bad-effects',[{id:'look',effects:{}}]]])add('prop-'+name,p=>p.scenes.s.images=[{id:'table',interactions:reactions}],name==='valid');
  add('interactive-prop-no-id',p=>p.scenes.s.images=[{interactions:[{id:'r'}]}],false);add('interactive-prop-duplicate-id',p=>p.scenes.s.images=[{id:'x',interactions:[{id:'r'}]},{id:'x'}],false);
  for(const key of ['name','sprites'])add('character-'+key,p=>p.characters=[{[key]:key==='name'?3:[null]}],false);
  for(const scenes of [[1],{},'s'])add('chapter-scenes-'+JSON.stringify(scenes),p=>p.chapters=[{scenes}],false);add('chapter-scenes-null',p=>p.chapters=[{scenes:null}]);
  add('gallery-sections',p=>p.gallery={sections:[null]},false);add('gallery-items',p=>p.gallery={sections:[{items:{}}]},false);
  for(const key of ['skills','recipes','locations','actors']){add('rpg-list-'+key,p=>p.rpg={[key]:[null]},false);add('rpg-cap-'+key,p=>p.rpg={[key]:Array.from({length:501},()=>({}))},false);}
  add('rpg-object',p=>p.rpg=[],false);add('rpg-schema',p=>{p.schemaVersion=7;p.rpg={};},false);add('rpg-action-schema',p=>{p.schemaVersion=7;p.scenes.s.actions=[{type:'rpg'}];},false);add('motion-schema',p=>{p.schemaVersion=6;p.scenes.s.actions=[{type:'keyframes'}];},false);
  add('layout-schema',p=>{p.schemaVersion=5;p.ui={layout:{version:2}};},false);
  for(const where of ['action','option','reaction']){
    const attach=(p,c)=>{if(where==='action')p.scenes.s.actions=[{type:'condition',condition:c}];else if(where==='option')p.scenes.s.actions=[{type:'choice',options:[{condition:c}]}];else p.scenes.s.images=[{id:'x',interactions:[{id:'r',condition:c}]}];};
    add('condition-object-'+where,p=>attach(p,4),false);add('condition-group-list-'+where,p=>attach(p,{conditions:[null]}),false);
    for(const [size,ok]of [[127,true],[128,false]])add('condition-count-'+where+'-'+size,p=>attach(p,{conditions:Array.from({length:size},()=>({}))}),ok);
    for(const [depth,ok]of [[8,true],[9,false]])add('condition-depth-'+where+'-'+depth,p=>{let c={};for(let n=0;n<depth;n++)c={conditions:[c]};attach(p,c);},ok);
  }
  add('complete-game-ui',p=>p.ui={layout:defaultGameUi({ui:{}},true)});
  for(const version of [1,2])add('ui-minimal-'+version,p=>p.ui={layout:{version}});
  for(const layout of [[],false,'',3,{},{version:'2'},{version:3}])add('ui-root-'+JSON.stringify(layout),p=>p.ui={layout},false);
  const objects={menu:['title'],dialogue:['window','name','text','next','portrait','hide'],choice:['rect','button'],quick:['rect'],pause:['title','back','content','button'],save:['title','back','content','button','pages'],load:['title','back','content','button','pages'],preferences:['title','back','content','button','options'],history:['title','back','content','button'],gallery:['title','back','content','button'],notify:['content']};
  for(const [screen,keys]of Object.entries(objects)){
    add('ui-page-'+screen,p=>p.ui={layout:{version:2,[screen]:3}},false);
    for(const key of keys)add('ui-element-'+screen+'-'+key,p=>p.ui={layout:{version:2,[screen]:{[key]:[]}}},false);
    add('ui-enabled-'+screen,p=>p.ui={layout:{version:2,[screen]:{enabled:'yes'}}},false);
  }
  for(const key of ['visible','enabled','label','font','align'])add('ui-field-'+key,p=>p.ui={layout:{version:2,custom:{[key]:null}}},false);
  for(const rect of [null,[],{unknown:1},{x:'2'},{h:null}])add('ui-rect-'+JSON.stringify(rect),p=>p.ui={layout:{version:2,custom:{rect}}},false);
  add('ui-negative-float-rect-preserved',p=>p.ui={layout:{version:2,custom:{rect:{x:-120.25,y:160.0,w:2.5,h:30}}}});
  for(const key of ['__proto__','constructor','prototype'])add('ui-reserved-'+key,p=>p.ui={layout:JSON.parse(JSON.stringify({version:2,custom:{[key]:{}}}))},false);
  for(const [n,ok]of [[510,true],[511,false]])add('ui-object-count-'+n,p=>p.ui={layout:{version:2,extra:Array.from({length:n},()=>({}))}},ok);
  for(const [n,ok]of [[8,true],[9,false]])add('ui-depth-'+n,p=>{let v={};for(let i=0;i<n;i++)v={extra:v};p.ui={layout:{...v,version:2}};},ok);
  for(const [screen,actions]of [['menu',MENU_ACTIONS],['pause',PAUSE_ACTIONS]]){
    const buttons=()=>actions.map(([id,label])=>({id,label}));
    add('ui-buttons-'+screen,p=>p.ui={layout:{version:2,[screen]:{buttons:buttons()}}});
    for(const fault of ['short','duplicate','unknown','label'])add('ui-buttons-'+screen+'-'+fault,p=>{const b=buttons();if(fault==='short')b.pop();if(fault==='duplicate')b[1].id=b[0].id;if(fault==='unknown')b[0].id='unknown';if(fault==='label')b[0].label=4;p.ui={layout:{version:2,[screen]:{buttons:b}}};},false);
  }
  const motion=()=>({id:'motion',type:'keyframes',target:{kind:'camera'},keyframes:[{id:'k0',time:0,x:50,y:50,scale:100,rotation:0,opacity:100},{id:'k1',time:1,x:60,y:40,scale:120,rotation:10,opacity:50}]});
  const move=(name,edit,ok=true)=>add(name,p=>{const a=motion();edit(a,p);p.scenes.s.actions=[a];},ok);
  move('motion-valid',()=>{});move('motion-image',(a,p)=>{p.scenes.s.images=[{id:'prop'}];a.target={kind:'image',id:'prop'};});move('motion-character',(a,p)=>{p.characters=[{id:'hero'}];a.target={kind:'character',id:'hero'};});
  move('motion-legacy-anonymous-character',(a,p)=>{p.characters=[{}];a.target={kind:'character'};});move('motion-explicit-null-is-not-missing',(a,p)=>{p.characters=[{}];a.target={kind:'character',id:null};},false);
  for(const target of [null,{},'camera',{kind:'unknown'},{kind:'character',id:'missing'},{kind:'image',id:'missing'}])move('motion-target-'+JSON.stringify(target),a=>a.target=target,false);
  for(const frames of [null,[],[{}],Array.from({length:129},()=>({})),[null,{}]])move('motion-frames-'+JSON.stringify(frames).slice(0,40),a=>a.keyframes=frames,false);
  for(const key of ['x','y','scale','rotation','opacity','time','id'])for(const bad of [null,{},true])move('motion-field-'+key+'-'+JSON.stringify(bad),a=>a.keyframes[1][key]=bad,false);
  move('motion-duplicate-id',a=>a.keyframes[1].id='k0',false);move('motion-empty-id',a=>a.keyframes[1].id='',false);move('motion-legacy-id-prototype',a=>a.keyframes[1].id='__proto__');
  for(const easing of ['linear','smooth','in','out','hold',null])move('motion-easing-'+easing,a=>a.keyframes[1].easing=easing);
  move('motion-legacy-array-easing',a=>a.keyframes[1].easing=[['linear']]);
  for(const easing of ['cubic',1,{},false])move('motion-bad-easing-'+JSON.stringify(easing),a=>a.keyframes[1].easing=easing,false);
  for(const [key,value,ok]of [['time',600,true],['time',601,false],['time',0,false],['x',-10000,true],['x',-10001,false],['scale',1,true],['scale',2000,true],['scale',2001,false],['opacity',0,true],['opacity',101,false],['blur',100,true],['blur',101,false],['blur',null,true],['blur','0',false]])move('motion-range-'+key+'-'+value,a=>a.keyframes[1][key]=value,ok);
  move('motion-first-time',a=>{a.keyframes[0].time=1;a.keyframes[1].time=2;},false);
  cases.push({name:'root-null',project:null,ok:false},{name:'root-array',project:[],ok:false});
  return cases;
}

// Seeded malformed/legacy field mutations supplement named acceptance cases.
// JSON round-tripping matches the actual native transport (no JS prototypes,
// functions, shared-object identities or sparse-array holes in the document).
export function documentMutationCorpus(count=1000){
  let seed=0x4953544f;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const fields=['schemaVersion','meta','meta/title','characters','characters/0/id','characters/0/name','characters/0/sprites','items','scenes/s','scenes/s/id','scenes/s/actions','scenes/s/characters','scenes/s/images','scenes/s/images/0/id','scenes/s/images/0/interactions','scenes/s/actions/0/type','scenes/s/actions/0/text','scenes/s/actions/0/condition','scenes/s/actions/0/target','scenes/s/actions/0/target/kind','scenes/s/actions/0/target/id','scenes/s/actions/0/keyframes','scenes/s/actions/0/keyframes/0/id','scenes/s/actions/0/keyframes/1/id','scenes/s/actions/0/keyframes/0/time','scenes/s/actions/0/keyframes/1/time','scenes/s/actions/0/keyframes/1/easing','scenes/s/actions/0/keyframes/1/x','scenes/s/actions/0/keyframes/1/y','scenes/s/actions/0/keyframes/1/scale','scenes/s/actions/0/keyframes/1/rotation','scenes/s/actions/0/keyframes/1/opacity','scenes/s/actions/0/keyframes/1/blur','rpg','ui/layout','ui/layout/version','ui/layout/dialogue','ui/layout/dialogue/window/rect','ui/layout/dialogue/window/rect/x','ui/layout/menu/buttons','ui/layout/menu/buttons/0/id','ui/layout/menu/buttons/0/label','ui/layout/menu/buttons/0/visible','ui/layout/preferences/options'];
  const values=[null,false,true,0,1,2,-1,8,9,7.5,'','linear','camera','smooth','s','hero','prop','unknown','8','Infinity',[],[null],[{}],['linear'],[['smooth']],{}, {id:'hero'},{toString:null},{version:2},{x:0,y:0,w:100,h:100}];
  return Array.from({length:count},(_,i)=>{
    const project={schemaVersion:8,meta:{title:'Мутация'},scenes:{s:{id:'s',title:'Сцена',characters:[],images:[{id:'prop',interactions:[{id:'r',label:'Осмотр',effects:[]}]}],actions:[{id:'a',type:'keyframes',target:{kind:'camera',id:'hero'},keyframes:[{id:'a',time:0,x:50,y:50,scale:100,rotation:0,opacity:100},{id:'b',time:1,x:60,y:40,scale:120,rotation:10,opacity:50}]}]}},characters:[{id:'hero',name:'Герой',sprites:[]}],chapters:[],items:[],rpg:{},ui:{layout:defaultGameUi({ui:{}},true)}};
    const field=fields[next()%fields.length],value=values[next()%values.length],keys=field.split('/');let target=project;for(const key of keys.slice(0,-1))target=target[key];target[keys.at(-1)]=structuredClone(value);
    return {name:'mutation-'+i+'-'+field,project:JSON.parse(JSON.stringify(project))};
  });
}
