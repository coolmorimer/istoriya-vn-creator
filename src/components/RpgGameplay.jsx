import {useState} from 'react';
import {rpgConfig,rpgLevel,craftAvailability} from '../../runtime/rpg-model.mjs';
import {rpgPreview,conditionPass} from '../domain/preview.js';
import {GameplayDialog} from './PreviewGameplay.jsx';
import './rpg.css';
export function RpgGameplay({project,state,setState}){
 const [tab,setTab]=useState('menu'),r=rpgConfig(project);if(!r.enabled)return null;
 const waiting=state.waiting?.type==='rpg',mode=state.waiting?.operation==='menu'?tab:state.waiting?.operation,actor=r.actors.find(a=>a.id===state.waiting?.actorId);
 const act=(operation,id)=>setState(previous=>rpgPreview(project,previous,operation,id));
 return <><div className="rpg-hud"><span>Здоровье: {state.rpg?.health??r.initialHealth} / {r.maxHealth}</span><span>Уровень: {rpgLevel(project,state)} · Опыт: {state.rpg?.xp??0}</span></div>{waiting&&<GameplayDialog label="Игровой мир" onClose={()=>act('close')} className="rpg-gameplay"><h2>Игровой мир</h2>{mode!=='actor'&&<nav aria-label="Разделы игрового мира">{[['menu','Персонаж'],['craft','Крафт'],['map','Карта']].map(([id,name])=><button key={id} aria-pressed={mode===id} onClick={()=>{setTab(id);setState(previous=>({...previous,waiting:{...previous.waiting,operation:'menu'}}));}}>{name}</button>)}</nav>}
  <p role="status">{state.rpg?.message}</p><div className="rpg-gameplay-content">
   {mode==='menu'&&<><h3>Персонаж</h3><p>Здоровье: {state.rpg?.health} / {r.maxHealth}</p><p>Уровень: {rpgLevel(project,state)} · Опыт: {state.rpg?.xp}</p>{r.skills.map(s=><p key={s.id}>{s.name}: {state.rpg?.skills[s.id]??0} / {s.max}</p>)}<h3>Инвентарь</h3>{(project.items??[]).filter(i=>(state.inventory[i.id]??0)>0).map(i=><p key={i.id}>{i.name} × {state.inventory[i.id]}</p>)}</>}
   {mode==='craft'&&<>{!r.recipes.length&&<p>Рецепты пока не добавлены.</p>}{r.recipes.map(c=>{const available=craftAvailability(project,state,c.id),names=rows=>rows.map(i=>`${project.items.find(item=>item.id===i.itemId)?.name??'Удалённый предмет'} × ${i.quantity}`).join(', ');return <section key={c.id}><h3>{c.name}</h3><p>{names(c.ingredients)} → {names(c.results)}</p>{!available.allowed&&<p>{available.reason}</p>}<button disabled={!available.allowed} onClick={()=>act('craft',c.id)}>Создать: {c.name}</button></section>;})}</>}
   {mode==='map'&&<div className="rpg-world-map" aria-label="Карта локаций">{!r.locations.length&&<p>Локации пока не добавлены.</p>}{r.locations.map(l=><button key={l.id} style={{left:l.x+'%',top:l.y+'%'}} disabled={!conditionPass(l.condition,state,project)} onClick={()=>act('travel',l.id)}>{l.name}</button>)}</div>}
   {mode==='actor'&&actor&&<><h3>{actor.name}</h3>{actor.role==='npc'?<button onClick={()=>act('talk')}>Поговорить</button>:state.rpg?.battle&&<><p>Здоровье противника: {state.rpg.battle.health}</p><button onClick={()=>act('attack')}>Атаковать</button>{r.skills.map(s=><button key={s.id} disabled={!(state.rpg.skills[s.id]>0)} onClick={()=>act('attack',s.id)}>Навык: {s.name}</button>)}</>}</>}
  </div><button onClick={()=>act('close')}>{state.rpg?.battle?'Отступить':'Продолжить'}</button></GameplayDialog>}</>;
}
