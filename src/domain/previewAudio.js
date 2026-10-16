import {AUDIO_CHANNELS,audioVolume,audioFade,isAudioResource} from '../../runtime/audio-model.mjs';
import {audioPlaybackMessage} from './audioPlayback.js';

// Playback is transient: checkpoints contain resource IDs, never players,
// wall-clock deadlines or an in-progress stop command.
export function createPreviewAudio({createAudio=source=>new Audio(source),now=()=>performance.now(),schedule=fn=>setTimeout(fn,16),cancel=clearTimeout,onStatus=()=>{},onVoiceActive=()=>{}}={}) {
 const players=new Map();let timer=null,disposed=false;
 const currentGain=entry=>{const ramp=entry.ramp;if(!ramp)return entry.gain;if(ramp.start===null)return ramp.from;const progress=Math.max(0,Math.min(1,(now()-ramp.start)/ramp.duration));return ramp.from+(ramp.to-ramp.from)*progress;};
 const volume=entry=>{entry.audio.volume=audioVolume(entry.volume*entry.mixer*currentGain(entry));};
 const remove=channel=>{const entry=players.get(channel);if(!entry)return;entry.audio.onended=null;entry.audio.onerror=null;entry.audio.pause();players.delete(channel);if(channel==='voice')onVoiceActive(false);};
 const tick=()=>{timer=null;if(disposed)return;for(const [channel,entry]of players){if(!entry.ramp||entry.ramp.start===null)continue;volume(entry);if(now()-entry.ramp.start>=entry.ramp.duration){entry.gain=entry.ramp.to;entry.ramp=null;if(entry.stopping)remove(channel);}}ensureTimer();};
 const ensureTimer=()=>{if(timer===null&&[...players.values()].some(entry=>entry.ramp&&entry.ramp.start!==null))timer=schedule(tick);};
 const fail=(channel,entry,error)=>{if(disposed||players.get(channel)!==entry)return;const message=audioPlaybackMessage(error);if(message){remove(channel);onStatus(message);}};
 return {
  update(tracks,resources,preferences,stops={}) {
   if(disposed)return;
   for(const channel of AUDIO_CHANNELS){const track=tracks[channel];let entry=players.get(channel);
    if(!track){if(!entry)continue;entry.mixer=audioVolume(preferences[channel]);const stop=stops[channel],seconds=audioFade(stop?.fadeOut);
     if(!seconds||entry.ended){remove(channel);continue;}
     if(!entry.stopping||entry.stopToken!==stop.token){entry.gain=currentGain(entry);entry.ramp={from:entry.gain,to:0,start:now(),duration:seconds*1000};entry.stopping=true;entry.stopToken=stop.token;}
     volume(entry);continue;
    }
    const resource=resources.find(r=>r.id===track.assetId);
    if(entry&&(entry.token!==track.token||entry.source!==resource?.source||entry.stopping)){remove(channel);entry=null;}
    if(!entry){if(!isAudioResource(resource)){onStatus('Запись недоступна. Восстановите её в разделе «Ресурсы».');continue;}
     try{const seconds=channel==='music'?audioFade(track.fadeIn):0,audio=createAudio(resource.source);entry={audio,source:resource.source,token:track.token,volume:audioVolume(track.volume??1),mixer:audioVolume(preferences[channel]),gain:seconds?0:1,ramp:seconds?{from:0,to:1,start:null,duration:seconds*1000}:null,stopping:false};players.set(channel,entry);audio.loop=track.loop??['music','ambience'].includes(channel);volume(entry);
      // Keep the completed token until the story replaces/stops it. Removing
      // it here would replay a one-shot sound on the next unrelated render.
      audio.onended=()=>{if(players.get(channel)===entry&&!audio.loop){entry.ended=true;entry.ramp=null;audio.onended=null;audio.pause();if(channel==='voice')onVoiceActive(false);}};audio.onerror=()=>fail(channel,entry,Error('Media decode failed'));if(channel==='voice')onVoiceActive(true);
      Promise.resolve(audio.play()).then(()=>{if(!disposed&&players.get(channel)===entry){if(entry.ramp?.start===null){entry.ramp.start=now();ensureTimer();}onStatus('');}}).catch(error=>fail(channel,entry,error));
     }catch(error){if(entry)remove(channel);onStatus(audioPlaybackMessage(error));}
    }else{entry.volume=audioVolume(track.volume??1);entry.mixer=audioVolume(preferences[channel]);volume(entry);}
   }
   ensureTimer();
  },
  dispose(){disposed=true;if(timer!==null)cancel(timer);timer=null;for(const channel of AUDIO_CHANNELS)remove(channel);},
 };
}
