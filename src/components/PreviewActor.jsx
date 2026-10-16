import {useLayoutEffect,useRef} from 'react';
import {actorTransformStyle,animationKeyframes,animationSettings} from '../../runtime/character-animation.mjs';
export function PreviewActor({layer,character,source,animation,resolutionHeight,paintIndex}) {
 const ref=useRef(null);
 useLayoutEffect(()=>{
  const image=ref.current;if(!image||!animation)return;
  const ratio=image.parentElement.clientHeight/(resolutionHeight||1080);
  const playback=image.animate(animationKeyframes(animation.base,animation.action,ratio),{duration:animationSettings(animation.action).duration*1000,easing:'linear'});
  return ()=>playback.cancel();
 },[animation?.token,source,resolutionHeight]);
 if(!source)return null;
 return <img ref={ref} className="preview-actor" data-character-id={layer.characterId} src={source} alt={character?.name??'Персонаж'} style={{left:`${layer.x??50}%`,top:`${layer.y??100}%`,opacity:(layer.opacity??100)/100,zIndex:paintIndex??layer.zOrder??10,transformOrigin:'50% 100%',transform:actorTransformStyle(layer)}}/>;
}
