import {useState} from 'react';
import {gameUi,rectStyle,uiSource,QUICK_ACTIONS} from '../../runtime/game-ui.mjs';
import {StyledText} from './TextAppearance.jsx';
import {resolveCharacterSprite} from '../../runtime/character-sprites.mjs';
import './game-ui.css';
export const uiTextStyle=(object,factor)=>({fontFamily:`"vn-${object.font}",sans-serif`,fontSize:object.size*factor,color:object.color,textAlign:object.align});
const alphaColor=(color,opacity)=>`${color.slice(0,7)}${Math.round((color.length===9?parseInt(color.slice(7),16)/255:1)*opacity/100*255).toString(16).padStart(2,'0')}`;
export function UiRegion({id,object,children,onRegion,style={},className=''}){return <div data-ui-region={id} className={`game-ui-region ${className}`} style={{...rectStyle(object.rect),...style}} onPointerDown={event=>onRegion?.(event,id)}>{children}</div>;}
export function GameUiButton({project,object,factor,state:forced,children,onClick,...props}){
 const [state,setState]=useState('idle'),current=forced??state,key={idle:'idleResourceId',hover:'hoverResourceId',pressed:'pressedResourceId',disabled:'disabledResourceId'}[current],source=uiSource(project,object,key)||uiSource(project,object,'idleResourceId');
 const background={idle:object.backgroundColor,hover:object.hoverColor,pressed:object.pressedColor,disabled:object.disabledColor}[current]??object.backgroundColor;
 return <button {...props} className={`game-ui-button ${props.className??''}`} style={{...uiTextStyle(object,factor),backgroundColor:background,backgroundImage:source?`url(${JSON.stringify(source)})`:undefined,...props.style}} onPointerEnter={()=>setState('hover')} onPointerLeave={()=>setState('idle')} onPointerDown={event=>{setState('pressed');props.onPointerDown?.(event);}} onPointerUp={()=>setState('hover')} onFocus={()=>setState('hover')} onBlur={()=>setState('idle')} onClick={onClick}>{children??object.label}</button>;
}
export function GameDialogue({project,action,character,width,animate=false,onRegion}){
 const page=gameUi(project).dialogue,factor=width/project.meta.resolution.width,[hidden,setHidden]=useState(false);
 if(hidden&&!onRegion)return <button className="game-ui-restore" onClick={e=>{e.stopPropagation();setHidden(false);}}>Показать интерфейс</button>;
 const window=page.window,source=uiSource(project,window)||project.ui.dialogueBackground;
 const portrait=project.resources.find(r=>r.id===character?.portraitResourceId)?.source??character?.portrait??resolveCharacterSprite(character,null,project.resources).source;
 return <div className="game-dialogue-view">
  <UiRegion id="window" object={window} onRegion={onRegion} style={{opacity:window.opacity/100,backgroundColor:window.color,backgroundImage:source?`url(${JSON.stringify(source)})`:undefined,backgroundSize:'100% 100%'}}/>
  {page.name.visible&&character&&<UiRegion id="name" object={page.name} onRegion={onRegion} style={uiTextStyle(page.name,factor)}>{character.name}</UiRegion>}
  <UiRegion id="text" object={page.text} onRegion={onRegion} className="game-ui-text"><StyledText project={project} action={action} animate={animate} factor={factor} minFontSize={1}>{action.text}</StyledText></UiRegion>
  {page.portrait.visible&&portrait&&<UiRegion id="portrait" object={page.portrait} onRegion={onRegion}><img src={portrait} alt="Портрет говорящего"/></UiRegion>}
  {page.next.visible&&<UiRegion id="next" object={page.next} onRegion={onRegion} style={uiTextStyle(page.next,factor)}>{page.next.label}</UiRegion>}
  {page.hide.visible&&<UiRegion id="hide" object={page.hide} onRegion={onRegion} style={uiTextStyle(page.hide,factor)}>{onRegion?page.hide.label:<button onClick={e=>{e.stopPropagation();setHidden(true);}}>{page.hide.label}</button>}</UiRegion>}
 </div>;
}
export function GameChoices({project,options,width,onChoose,onRegion,state}){const page=gameUi(project).choice,factor=width/project.meta.resolution.width;return <UiRegion id="screen" object={page} onRegion={onRegion} className="game-choice-view"><div style={{gap:page.spacing*project.meta.resolution.height*factor/100}}>{options.map(option=><GameUiButton key={option.id} project={project} object={page.button} factor={factor} state={state} style={{height:page.button.height*project.meta.resolution.height*factor/100,padding:`0 ${page.button.padding*width/100}px`}} onClick={event=>{event.stopPropagation();onChoose?.(option.id);}}>{option.text}</GameUiButton>)}</div></UiRegion>;}
export function GameQuick({project,width,onRegion,onAction,disabled={},mode}){const page=gameUi(project).quick,factor=width/project.meta.resolution.width;if(!project.ui.showQuickMenu)return null;return <UiRegion id="screen" object={page} onRegion={onRegion} className="game-quick-view" style={{...uiTextStyle(page,factor),backgroundColor:alphaColor(page.backgroundColor,page.opacity)}}>{QUICK_ACTIONS.filter(([id])=>project.ui.quickMenuButtons?.[id]!==false).map(([id,label])=>onAction?<button key={id} aria-label={`Тест: ${label}`} disabled={!!disabled[id]} aria-pressed={['auto','skip'].includes(id)?mode===id:undefined} onClick={e=>{e.stopPropagation();onAction(id);}}>{label}</button>:<span key={id}>{label}</span>)}</UiRegion>;}
