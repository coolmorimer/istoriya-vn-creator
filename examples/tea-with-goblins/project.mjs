import {sceneImages} from '../../runtime/image-layers.mjs';
export function createTeaVisualProject(textProject,resources) {
 const p=structuredClone(textProject),resource=id=>resources.find(r=>r.id===id);
 p.id='example_tea_layered_v1';p.meta.title='Чай вместо подвига';p.meta.version='1.0.0';p.meta.description='Небольшая аниме-новелла: страх, недоразумение и гостеприимство. Фон, герои, стол и посуда редактируются отдельно.';p.meta.saveDirectory='istoriya_tea_layered_v1';p.meta.buildQuality='original';p.resources=resources;
 const emotions={elira:['neutral','worried','embarrassed','happy'],brog:['neutral','happy'],tik:['neutral','happy']};
 for(const character of p.characters){character.defaultSpriteId=`${character.id}-neutral`;character.portrait=null;character.portraitResourceId=`${character.id}-neutral`;character.sprites=emotions[character.id].map(emotion=>({id:`${character.id}-${emotion}`,name:({neutral:'Спокойствие',worried:'Испуг',embarrassed:'Смущение',happy:'Радость'})[emotion],resourceId:`${character.id}-${emotion}`}));}
 p.ui={...p.ui,accent:'#bd88ed',dialogueOpacity:91,dialogueFontSize:34,narratorFontSize:32,textSpeed:40,mainMenuBackground:resource('cave-empty')?.source,mainMenuBackgroundResourceId:'cave-empty',mainMenuButtons:{start:true,load:true,gallery:false,preferences:true,about:true,quit:true}};
 p.editor.showGuides=false;
 const base=structuredClone(p.scenes.tea_8),tail=base.actions.filter(a=>['dialogue','narration'].includes(a.type)).slice(-1);
 p.scenes.tea_8.actions=p.scenes.tea_8.actions.filter(a=>a.type!=='end'&&!tail.some(t=>t.id===a.id));
 p.scenes.tea_8.actions.push({id:'jump_8',type:'jump',targetSceneId:'tea_9'});
 p.scenes.tea_9={...base,id:'tea_9',number:'2.2',title:'Светлая тропа',actions:[...tail,{id:'tea_end',type:'end'}]};
 let serial=0;const action=(type,values={})=>({id:`visual_${++serial}`,type,...values});
 const emotionFor=(sceneId,speaker,index)=>{if(speaker==='elira'){if(['tea_1','tea_2'].includes(sceneId))return index<2&&sceneId==='tea_1'?'neutral':'worried';if(sceneId==='tea_3')return index<3?'worried':'embarrassed';if(sceneId==='tea_4'||sceneId==='tea_6')return index<4?'embarrassed':'happy';return'happy';}return ['tea_1','tea_2','tea_3'].includes(sceneId)?'neutral':'happy';};
 for(const [id,scene]of Object.entries(p.scenes)){
  const outside=['tea_1','tea_9'].includes(id),tea=['tea_5','tea_6','tea_7','tea_8'].includes(id);
  scene.background=null;scene.backgroundResourceId=id==='tea_1'?'forest-rain':id==='tea_9'?'forest-clear':'cave-empty';scene.backgroundTransform={fit:'cover',x:50,y:50,scale:100,width:100,height:100};scene.transition='dissolve';scene.description=outside?'Лес · отдельный слой героини':'Интерьер · герои · стол · посуда — независимые слои';
  scene.images=outside?[]:sceneImages({images:[{id:`${id}_table`,name:'Стол',resourceId:'table',x:50,y:126,width:94,height:105,zOrder:50},{id:`${id}_service`,name:'Чай и пирог',resourceId:'tea-service',x:50,y:72,width:58,height:38,zOrder:60}]});
  const actors=outside?['elira']:['brog','tik','elira'];
  scene.characters=actors.map((characterId,index)=>({id:`${id}_${characterId}`,characterId,spriteId:`${characterId}-${emotionFor(id,characterId,0)}`,name:p.characters.find(c=>c.id===characterId).name,x:outside?76:[22,50,79][index],y:tea?(characterId==='elira'?118:108):102,scale:tea?(characterId==='elira'?106:94):94,rotation:0,opacity:100,visible:true,locked:false,flip:false}));
  const intro=[];
  if(id==='tea_1')intro.push(action('music',{assetId:'mystery',volume:.35,fadeIn:1,loop:true}));
  if(id==='tea_5')intro.push(action('music',{assetId:'tea-theme',volume:.38,fadeIn:1.5,loop:true}));
  intro.push(action('ambience',{assetId:outside?'rain':'fire',volume:outside?.28:.35,loop:true}));
  if(id==='tea_9')intro.push(action('ambience',{assetId:'rain',volume:.05,loop:true}));
  if(['tea_1','tea_2'].includes(id)){const entering=scene.characters[0];intro.push(action('showCharacter',{characterId:entering.characterId,spriteId:entering.spriteId,x:id==='tea_1'?125:-25,y:entering.y,scale:entering.scale,transition:'none'}),action('moveCharacter',{characterId:entering.characterId,x:entering.x,y:entering.y,duration:.8}));}
  const authored=[];
  scene.actions.forEach((item,index)=>{
   if(item.type==='dialogue')item.spriteId=`${item.speakerId}-${emotionFor(id,item.speakerId,index)}`;
   if(id==='tea_1'&&index===5)authored.push(action('sound',{assetId:'twig',volume:.6}));
   if(id==='tea_3'&&index===0)authored.push(action('sound',{assetId:'magic',volume:.55}));
   if(id==='tea_5'&&index===1)authored.push(action('sound',{assetId:'cup',volume:.55}));
   authored.push(item);
   if(['tea_3','tea_6','tea_7'].includes(id)&&item.type==='dialogue'&&item.speakerId==='tik')authored.push(action('characterAnimation',{characterId:'tik',spriteId:item.spriteId,animation:'bounce',duration:.55,intensity:.35}));
  });
  scene.actions=[...intro,...authored];
 }
 p.chapters=[{id:'tea_evening',title:'Глава 1. Незваная гостья',entrySceneId:'tea_1',scenes:['tea_1','tea_2','tea_3','tea_4','tea_5','tea_6','tea_7']},{id:'tea_dawn',title:'Глава 2. Светлая тропа',entrySceneId:'tea_8',scenes:['tea_8','tea_9']}];
 p.scenes.tea_8.number='2.1';
 p.gallery={sections:[]};return p;
}
