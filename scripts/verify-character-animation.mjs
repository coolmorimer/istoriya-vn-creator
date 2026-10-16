import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createProject} from '../src/domain/projectFactory.js';
import {compileProject} from '../runtime/compiler.mjs';
import {CHARACTER_ANIMATIONS,animationPlan} from '../runtime/character-animation.mjs';
import {createQaDirectory} from './qa-directory.mjs';
const root=await createQaDirectory('animation-runtime-');
const p=createProject({title:'Проверка анимаций'});
const embedded=async name=>`data:image/png;base64,${(await fs.readFile(path.resolve('examples/tea-with-goblins/assets',name+'.png'))).toString('base64')}`;
p.meta.buildName='animation_qa';p.ui.textStyle={speed:0};
p.characters=[{id:'hero',name:'Элира',mainSpriteId:'main',sprites:[{id:'main',name:'Основной',source:await embedded('elira-neutral')},{id:'worried',name:'Тревога',source:await embedded('elira-worried')}]},{id:'spectator',name:'Брог',sprites:[{id:'main',name:'Основной',source:await embedded('brog-neutral')}]}];
p.scenes={};p.chapters[0].scenes=[];
const base={id:'hero-layer',characterId:'hero',spriteId:'worried',x:30,y:102,scale:145,rotation:17,opacity:65,flip:true,visible:true};
for(const name of CHARACTER_ANIMATIONS){const id=`anim_${name}`;p.chapters[0].scenes.push(id);p.scenes[id]={id,title:name,number:`1.${p.chapters[0].scenes.length}`,transition:'none',background:null,characters:[base,{id:'spectator-layer',characterId:'spectator',x:80,y:100,scale:60,visible:true}],actions:[{id:'before',type:'narration',text:`before ${name}`},{id:'animate',type:'characterAnimation',characterId:'hero',animation:name,duration:.8,intensity:1.2},{id:'after',type:'narration',text:`after ${name}`},{id:'move',type:'moveCharacter',characterId:'hero',x:65,y:102,duration:.1},{id:'moved',type:'narration',text:`moved ${name}`},{id:'end',type:'end'}]};}
p.chapters[0].scenes.push('timed');p.scenes.timed={...structuredClone(p.scenes.anim_pulse),id:'timed',title:'Timed pulse',timelineEnabled:true,actions:[{id:'text',type:'narration',text:'timed pulse',timeline:{start:0,duration:3,waitForClick:true}},{id:'pulse',type:'characterAnimation',characterId:'hero',animation:'pulse',intensity:1.2,timeline:{start:.2,duration:1}}]};
await compileProject(p,path.join(root,'project'),{sdkPath:path.resolve('../renpy-8.5.3-sdk'),assetsRoot:path.resolve('public')});
const header=await fs.readFile('tests/fixtures/character-animation-checks.rpy','utf8');
const cases=CHARACTER_ANIMATIONS.map(name=>{const factor=animationPlan({animation:name,intensity:1.2}).at(-1).zoom;return `
testcase preset_${name}:
    run Start("scene_anim_${name.toLowerCase()}")
    advance until eval (_last_say_what or "") == "before ${name}"
    $ before_bounds = renpy.get_image_bounds("actor_hero")
    $ before_sources = _qa_image_sources("actor_hero")
    $ spectator_bounds = renpy.get_image_bounds("actor_spectator")
    assert eval any("worried" in source for source in before_sources)
    advance until eval (_last_say_what or "") == "after ${name}"
    $ after_bounds = renpy.get_image_bounds("actor_hero")
    assert eval abs(after_bounds[2] / before_bounds[2] - ${factor}) < 0.003
    assert eval abs(after_bounds[3] / before_bounds[3] - ${factor}) < 0.003
    assert eval before_sources == _qa_image_sources("actor_hero")
    assert eval spectator_bounds == renpy.get_image_bounds("actor_spectator")
    $ actor_state = renpy.game.context().scene_lists.get_displayable_by_tag("master", "actor_hero").state
    assert eval abs(actor_state.zoom - ${1.45*factor}) < 0.001
    assert eval actor_state.rotate == 17 and actor_state.xzoom == -1
    assert eval abs(actor_state.alpha - 0.65) < 0.001
    assert eval abs(actor_state.xpos - 0.3) < 0.001 and abs(actor_state.ypos - 1.02) < 0.001
    screenshot "animation-${name}.png"
    advance until eval (_last_say_what or "") == "moved ${name}"
    assert eval abs(renpy.get_image_bounds("actor_hero")[2] / before_bounds[2] - ${factor}) < 0.003
    assert eval before_sources == _qa_image_sources("actor_hero")
`;}).join('\n');
const phase=`
testcase timed_phase:
    run Start("scene_timed")
    pause 0.7
    $ actor_state = renpy.game.context().scene_lists.get_displayable_by_tag("master", "actor_hero").state
    assert eval actor_state.zoom > 1.48
    screenshot "animation-timed-midpoint.png"
    pause 1.0
    $ actor_state = renpy.game.context().scene_lists.get_displayable_by_tag("master", "actor_hero").state
    assert eval abs(actor_state.zoom - 1.45) < 0.001
`;
const fixturePath=path.join(root,'testcases.rpy');await fs.writeFile(fixturePath,header+cases+phase);
await fs.writeFile(path.join(root,'project.vnproject'),JSON.stringify(p));
console.log(`Animation fixture: ${root}`);
if(!process.argv.includes('--prepare-only')){
 const child=spawn(process.execPath,['scripts/test-tea-runtime.mjs','--isolated-desktop','--source',path.join(root,'project'),'--fixture',fixturePath,'--qa-root',root],{stdio:'inherit',windowsHide:true});
 process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
}
