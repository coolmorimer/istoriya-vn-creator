import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {evaluateCondition,compileCondition,conditionProblems,applyGameplayEffect,compileGameplayEffect,effectProblems} from '../runtime/game-logic.mjs';
import {logicReferences} from '../runtime/logic-references.mjs';
import {createProject} from '../src/domain/projectFactory.js';
import {validateProject} from '../src/domain/validator.js';
import {useProjectStore as store} from '../src/store/projectStore.js';
const literal=v=>typeof v==='boolean'?(v?'True':'False'):JSON.stringify(v),asciiId=(id,prefix)=>`${prefix}_${id}`;
function fixture(){const p=createProject();p.flags=[{id:'found',name:'Найдено',initial:false},{id:'open',name:'Открыто',initial:false}];p.variables=[{id:'number',name:'Число',type:'number',initial:2},{id:'text',name:'Текст',type:'text',initial:'чай и мята'},{id:'yes',name:'Да',type:'boolean',initial:false},{id:'love',name:'Отношения',type:'relationship',initial:2,min:0,max:3}];p.items=[{id:'coin',name:'Монета',description:''}];return {p,state:{flags:{found:true,open:false},variables:{number:2,text:'чай и мята',yes:false,love:2},inventory:{coin:2}}};}
test('nested all/any, inversion, flags, text and inventory agree with real Python expression evaluation',()=>{
 const {p,state}=fixture(),cases=[null,{flagId:'found',value:'true'}, {flagId:'open',value:'false'},{variableId:'number',operator:'gte',value:'2'}, {variableId:'text',operator:'contains',value:'мята'},{itemId:'coin',operator:'eq',value:2},{kind:'all',conditions:[{flagId:'found',value:true},{kind:'any',conditions:[{itemId:'coin',operator:'gt',value:10},{variableId:'text',value:'чай и мята'}]}]},{kind:'any',negate:true,conditions:[{flagId:'open',value:true},{itemId:'coin',operator:'lt',value:1}]}];
 const python=`import json\nflag_found=True\nflag_open=False\nv_number=2\nv_text='чай и мята'\nv_yes=False\nv_love=2\nistoriya_inventory={'coin':2}\nprint(json.dumps([${cases.map(c=>compileCondition(c,p,{asciiId,literal})).join(',')}]))`;
 const result=spawnSync(path.resolve('../renpy-8.5.3-sdk/lib/py3-windows-x86_64/python.exe'),['-c',python],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),cases.map(c=>evaluateCondition(c,state,p)));
});
test('broken, unknown, empty, cyclic and excessively deep conditions fail closed',()=>{
 const {p,state}=fixture(),cyclic={kind:'all',conditions:[]};cyclic.conditions.push(cyclic);
 let deep={flagId:'found',value:true};for(let i=0;i<10;i++)deep={kind:'all',conditions:[deep]};
 for(const condition of [{variableId:'missing',value:0},{kind:'any',conditions:[]},{flagId:'found',operator:'evil',value:true},{itemId:'coin',value:-1},{variableId:'number',value:'nan'},cyclic,deep]){assert.ok(conditionProblems(condition,p).length);assert.equal(evaluateCondition(condition,state,p),false);assert.equal(compileCondition(condition,p,{asciiId,literal}),'False');}
});
test('multiple typed effects, string false, inventory floor and relationship clamp agree with Python',()=>{
 const {p,state}=fixture(),effects=[{flagId:'found',value:'false'},{kind:'flag',flagId:'open',value:true},{kind:'variable',variableId:'text',operation:'set',value:'Передано'},{variableId:'yes',value:true},{variableId:'love',operation:'add',value:10},{kind:'inventory',itemId:'coin',operation:'add',quantity:2},{kind:'inventory',itemId:'coin',operation:'remove',quantity:10}];
 const statements=effects.flatMap(effect=>compileGameplayEffect(effect,p,{asciiId,literal}));for(const effect of effects)assert.equal(applyGameplayEffect(effect,state,p),true);
 const python=`import json\nflag_found=True\nflag_open=False\nv_text='чай и мята'\nv_yes=False\nv_love=2\nistoriya_inventory={'coin':2}\n${statements.join('\n')}\nprint(json.dumps([flag_found,flag_open,v_text,v_yes,v_love,istoriya_inventory['coin']]))`;
 const result=spawnSync(path.resolve('../renpy-8.5.3-sdk/lib/py3-windows-x86_64/python.exe'),['-c',python],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),[state.flags.found,state.flags.open,state.variables.text,state.variables.yes,state.variables.love,state.inventory.coin]);
});
test('invalid effects do not mutate player state or silently compile',()=>{
 const {p,state}=fixture(),before=structuredClone(state);for(const effect of [{kind:'flag',flagId:'missing',value:true},{kind:'variable',variableId:'text',operation:'add',value:1},{kind:'inventory',itemId:'coin',operation:'add',quantity:.5},{variableId:'number',value:'bad'}]){assert.ok(effectProblems(effect,p).length);assert.equal(applyGameplayEffect(effect,state,p),false);assert.throws(()=>compileGameplayEffect(effect,p,{asciiId,literal}));}assert.deepEqual(state,before);
});
test('explicit variable result wins over a stale flag field left by the legacy editor',()=>{
 const {p,state}=fixture(),s=Object.values(p.scenes)[0],effect={kind:'variable',variableId:'text',flagId:'found',operation:'set',value:'Исправлено'};
 assert.equal(applyGameplayEffect(effect,state,p),true);assert.equal(state.flags.found,true);assert.equal(state.variables.text,'Исправлено');
 assert.deepEqual(compileGameplayEffect(effect,p,{asciiId,literal}),['v_text = "Исправлено"']);
 s.actions=[{id:'choice',type:'choice',options:[{id:'a',text:'Да',targetSceneId:s.id,effects:[effect]}]}];assert.equal(logicReferences(p,'flag','found').length,0);assert.equal(logicReferences(p,'variable','text').length,1);
});
test('inventory CRUD is undoable and recursive references block destructive deletion',()=>{
 const {p}=fixture(),s=Object.values(p.scenes)[0];s.actions=[{id:'choice',type:'choice',prompt:'Выбор',options:[{id:'a',text:'Да',targetSceneId:s.id,condition:{kind:'all',conditions:[{itemId:'coin',value:1},{flagId:'found',value:true},{variableId:'number',value:2}]},effects:[{kind:'flag',flagId:'open',value:false}]}]}];
 store.setState({project:p,past:[],future:[]});for(const [kind,id] of [['item','coin'],['flag','found'],['flag','open'],['variable','number']])assert.equal(logicReferences(p,kind,id).length,1);
 assert.equal(store.getState().removeItem('coin'),false);assert.equal(store.getState().removeFlag('found'),false);assert.equal(store.getState().removeVariable('number'),false);
 const id=store.getState().addItem();assert.equal(store.getState().project.items.length,2);assert.equal(store.getState().selectedInventoryId,id);store.getState().undo();assert.equal(store.getState().project.items.length,1);store.getState().redo();assert.equal(store.getState().project.items.length,2);assert.equal(store.getState().selectedInventoryId,id);assert.equal(store.getState().removeItem(id),true);store.getState().undo();assert.ok(store.getState().project.items.some(i=>i.id===id));assert.equal(store.getState().selectedInventoryId,id);
});
test('validator checks compound conditions, typed effects, malformed inventory and missing chapter entry',()=>{
 const {p}=fixture(),s=Object.values(p.scenes)[0];s.actions=[{id:'branch',type:'condition',condition:{kind:'any',conditions:[{itemId:'coin',value:1},{flagId:'found',value:true}]},trueSceneId:s.id,falseSceneId:s.id}];assert.equal(validateProject(p).valid,true);
 s.actions[0].condition.conditions[1].flagId='gone';assert.equal(validateProject(p).valid,false);p.items[0].name=42;assert.doesNotThrow(()=>validateProject(p));assert.equal(validateProject(p).valid,false);
 p.items[0].name='Монета';s.actions=[];p.resources=[{id:'pic',name:'Картинка',source:'pic.png'}];s.images=[{id:'prop',resourceId:'pic',interactions:[{id:'click',label:'Открыть',targetChapterId:'gone'}]}];assert.ok(validateProject(p).issues.some(i=>i.code==='broken-reaction-chapter'));
});
test('provably impossible exploration and choices are diagnosed, mutable/uncertain states are not falsely rejected',()=>{
 const {p}=fixture(),s=Object.values(p.scenes)[0];s.actions=[{id:'explore',type:'explore',requiredItemId:'coin',requiredFlagId:'found',condition:{kind:'any',conditions:[{flagId:'open',value:true},{variableId:'number',operator:'gt',value:100}]}},{id:'end',type:'end'}];
 let codes=validateProject(p).issues.map(i=>i.code);for(const code of ['impossible-exploration-item','impossible-exploration-flag','impossible-exploration-condition'])assert.ok(codes.includes(code));
 s.actions.unshift({id:'give',type:'choice',options:[{id:'yes',text:'Получить',targetSceneId:s.id,effects:[{kind:'inventory',itemId:'coin',operation:'add',quantity:1},{kind:'flag',flagId:'found',value:true},{kind:'variable',variableId:'number',operation:'add',value:1}]}]});
 codes=validateProject(p).issues.map(i=>i.code);assert.ok(!codes.some(c=>c.startsWith('impossible-exploration')),'potential prior changes make the state uncertain, not impossible');
 s.actions=[{id:'hidden',type:'choice',options:[{id:'a',text:'Скрыто',targetSceneId:s.id,condition:{flagId:'open',value:true}}]}];assert.ok(validateProject(p).issues.some(i=>i.code==='choice-always-hidden'));
});
