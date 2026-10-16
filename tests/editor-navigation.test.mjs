import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/projectFactory.js';
import {editorNavigation} from '../src/domain/editorNavigation.js';
import {projectSearchIndex,searchProject,searchPage,plainNavigationKey} from '../src/domain/projectSearch.js';
import {resourceUsageIndex} from '../src/domain/resourceUsage.js';
import {useProjectStore as store} from '../src/store/projectStore.js';
function fixture(){const p=createProject(),s=Object.values(p.scenes)[0];p.resources=[{id:'image',name:'Дверь',fileName:'door.png',mime:'image/png',category:'prop',source:'data:image/png;base64,NEVER_INDEX_MEDIA'}];s.images=[{id:'door',name:'Дверь',resourceId:'image',interactions:[{id:'open',label:'Войти',text:'Чай вместо подвига',resultResourceId:'image'}]}];s.backgroundResourceId='image';s.actions=[{id:'first',type:'narration',text:'Первый текст'},{id:'explore',type:'explore'},{id:'last',type:'narration',text:'Забытый герой вернулся'}];p.characters=[{id:'hero',name:'Берёзка',sprites:[{id:'angry',name:'Сердитая',resourceId:'image'}]}];p.items=[{id:'key',name:'Ключ',description:'К двери',iconResourceId:'image'}];p.gallery.sections=[{id:'initial',title:'Первый раздел',items:[]},{id:'second',title:'Второй раздел',items:[{id:'cg',title:'После чаепития',resourceId:'image'}]}];return {p,s};}

test('navigation selects the exact action instead of retaining an open map or the first frame, without editing/history',()=>{
 const {p,s}=fixture(),before=JSON.stringify(p);store.setState({project:p,recovery:null,activeSection:'resources',bottomTab:'map',timelineTime:42,past:[],future:[],navigationRequest:0});let events=0;const off=store.subscribe(()=>events++);store.getState().navigateTo({kind:'scene',id:s.id,actionId:'last'});off();const state=store.getState();assert.equal(events,1);assert.equal(state.activeActionId,'last');assert.equal(state.bottomTab,'scenario');assert.equal(state.activeSection,'scenes');assert.equal(state.activeLayerId,null);assert.equal(state.past.length,0);assert.equal(state.project,p);assert.equal(JSON.stringify(p),before);
});
test('background and reaction navigation open the original background or the matching exploration/prop/reaction',()=>{
 const {p,s}=fixture(),base=editorNavigation(p,{kind:'scene',id:s.id,background:true});assert.equal(base.activeActionId,null);assert.equal(base.activeLayerId,'__background');const reaction=editorNavigation(p,{kind:'scene',id:s.id,layerId:'door',reactionId:'open'});assert.equal(reaction.activeActionId,'explore');assert.equal(reaction.navigationTarget.focusKind,'reaction');assert.equal(reaction.navigationTarget.focusId,'open');assert.equal(reaction.activeLayerId,'door');
});
test('timed action navigation moves the actual playhead and never converts a legacy scene',()=>{
 const {p,s}=fixture();s.timelineEnabled=true;s.actions[2].timeline={start:17,duration:3,enabled:true};const before=structuredClone(p),plan=editorNavigation(p,{kind:'scene',id:s.id,actionId:'last'});assert.equal(plan.bottomTab,'timeline');assert.equal(plan.timelineTime,17);assert.equal(plan.activeActionId,'last');assert.deepEqual(p,before);
});
test('usage references retain exact sprite/reaction/gallery identities and all positions beyond eight',()=>{
 const {p,s}=fixture();for(let i=0;i<25;i++)s.actions.push({id:`more${i}`,type:'showCG',assetId:'image'});const uses=resourceUsageIndex(p).get('image');assert.ok(uses.length>25);assert.equal(uses.find(u=>u.reactionId==='open').layerId,'door');assert.equal(uses.find(u=>u.spriteId==='angry').id,'hero');const gallery=uses.find(u=>u.kind==='gallery');assert.equal(gallery.id,'second');assert.equal(gallery.itemId,'cg');assert.equal(editorNavigation(p,gallery).navigationTarget.focusId,'cg');assert.equal(new Set(uses.map(u=>u.key)).size,uses.length);assert.equal(searchPage(uses,999).entries.at(-1).kind,'gallery');
});
test('stale project, scene, action, prop, reaction, gallery, sprite and resource links fail before store mutation',()=>{
 const {p,s}=fixture();store.setState({project:p,recovery:null,navigationRequest:0});for(const target of [{kind:'scene',id:s.id,projectId:'old'},{kind:'scene',id:'missing'},{kind:'scene',id:'constructor'},{kind:'scene',id:s.id,actionId:'missing'},{kind:'scene',id:s.id,layerId:'missing'},{kind:'scene',id:s.id,layerId:'door',reactionId:'gone'},{kind:'character',id:'hero',spriteId:'missing'},{kind:'gallery',id:'second',itemId:'missing'},{kind:'inventory',id:'gone'},{kind:'resource',id:'gone'}]){const before=store.getState();assert.throws(()=>store.getState().navigateTo(target));assert.equal(store.getState(),before);}
});
test('global search reaches dialogue, reaction text, chapters, resources, sprites, inventory and gallery without media bodies',()=>{
 const {p,s}=fixture(),before=JSON.stringify(p),index=projectSearchIndex(p);assert.equal(searchProject(index,'забытый герой','text')[0].location.actionId,'last');assert.equal(searchProject(index,'чай подвига','objects')[0].location.reactionId,'open');assert.equal(searchProject(index,'березка','characters').length,2);assert.equal(searchProject(index,'сердитая','characters')[0].location.spriteId,'angry');assert.equal(searchProject(index,'door.png','resources')[0].location.id,'image');assert.equal(searchProject(index,'к двери','inventory')[0].location.id,'key');assert.equal(searchProject(index,'чаепития','gallery')[0].location.itemId,'cg');assert.equal(searchProject(index,'NEVER_INDEX_MEDIA').length,0);assert.equal(JSON.stringify(p),before);assert.ok(index.some(e=>e.location.kind==='chapter'));assert.ok(index.some(e=>e.location.kind==='scene'&&e.location.id===s.id));
});
test('bounded pages expose the final match across thousands of results and clamp searches to valid pages',()=>{
 const entries=Array.from({length:5001},(_,i)=>({id:i}));assert.equal(searchPage(entries).entries.length,8);assert.equal(searchPage(entries,9999).entries.at(-1).id,5000);assert.equal(searchPage([],9999).page,0);assert.equal(searchPage(entries,-1).page,0);assert.throws(()=>searchPage(entries,0,0));
});
test('ordinary scene switches reset the playhead in the store, not a panel mount that would erase exact navigation',()=>{
 const {p,s}=fixture();p.scenes.other={...structuredClone(s),id:'other'};store.setState({project:p,activeSceneId:s.id,timelineTime:17,recovery:null});store.getState().setActiveScene(s.id);assert.equal(store.getState().timelineTime,17);store.getState().setActiveScene('other');assert.equal(store.getState().timelineTime,0);
});
test('modified text-editing keys and composition do not become search-list navigation',()=>{
 assert.equal(plainNavigationKey({key:'End'}),true);for(const modifier of ['shiftKey','ctrlKey','metaKey','altKey','isComposing'])assert.equal(plainNavigationKey({[modifier]:true,key:'Home'}),false);
});
