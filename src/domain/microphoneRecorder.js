const aborted=()=>Object.assign(Error('Запись отменена.'),{name:'AbortError'});
export function microphoneError(error){
 if(['NotAllowedError','SecurityError'].includes(error?.name))return 'Нет доступа к микрофону. Разрешите его для редактора в настройках Windows и повторите запись.';
 if(error?.name==='NotFoundError')return 'Микрофон не найден. Подключите его или загрузите готовую запись.';
 if(error?.name==='NotReadableError')return 'Микрофон занят или недоступен. Закройте использующее его приложение и повторите запись.';
 return /[а-яё]/i.test(error?.message??'')?error.message:'Не удалось записать звук. Можно загрузить готовый WAV, MP3 или OGG.';
}
export function pcmMonoWav(audio,maxSeconds=120){
 const {length,sampleRate,numberOfChannels}=audio;
 if(!Number.isInteger(length)||length<1||!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000||!Number.isInteger(numberOfChannels)||numberOfChannels<1||numberOfChannels>8||length/sampleRate>maxSeconds+.5)throw Error('Запись пустая, слишком длинная или имеет неподдерживаемый формат.');
 const bytes=new ArrayBuffer(44+length*2),view=new DataView(bytes),text=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
 text(0,'RIFF');view.setUint32(4,36+length*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,length*2,true);
 const channels=Array.from({length:numberOfChannels},(_,i)=>audio.getChannelData(i));
 for(let i=0;i<length;i++){let value=0;for(const channel of channels)value+=Number.isFinite(channel[i])?channel[i]/numberOfChannels:0;value=Math.max(-1,Math.min(1,value));view.setInt16(44+i*2,Math.round(value*(value<0?32768:32767)),true);}
 return new Blob([bytes],{type:'audio/wav'});
}
// Only start() asks for permission, after the author's explicit button press.
// A canceled, still-pending permission response is immediately released later.
export function createMicrophoneRecorder({mediaDevices=globalThis.navigator?.mediaDevices,MediaRecorderClass=globalThis.MediaRecorder,AudioContextClass=globalThis.AudioContext??globalThis.webkitAudioContext,now=()=>performance.now(),interval=setInterval,clear=clearInterval,maxSeconds=120,maxBytes=16*1024*1024,onState=()=>{},onElapsed=()=>{},onLimit=()=>{},onFailure=()=>{}}={}){
 let stream=null,recorder=null,timer=null,canceled=false,started=false,finishing=false,chunks=[],size=0,finishPromise=null,resolveStop,rejectStop;
 const stopped=new Promise((resolve,reject)=>{resolveStop=resolve;rejectStop=reject;});stopped.catch(()=>{});
 const release=()=>{if(timer!==null)clear(timer);timer=null;const previous=stream;stream=null;for(const track of previous?.getTracks()??[])track.stop();};
 const clearHandlers=()=>{if(recorder){recorder.ondataavailable=null;recorder.onstop=null;recorder.onerror=null;}};
 const dispose=()=>{clearHandlers();if(recorder&&recorder.state!=='inactive')try{recorder.stop();}catch{}release();chunks=[];};
 const failure=error=>{rejectStop(error);dispose();onFailure(microphoneError(error));};
 return {
  async start(){
   if(started||canceled)throw aborted();started=true;
   if(!mediaDevices?.getUserMedia||!MediaRecorderClass||!AudioContextClass)throw Error('Запись с микрофона недоступна. Обновите WebView2 или загрузите готовый WAV, MP3 или OGG.');
   onState('requesting');
   try{stream=await mediaDevices.getUserMedia({audio:true,video:false});if(canceled){release();throw aborted();}
    const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/webm'].find(type=>MediaRecorderClass.isTypeSupported?.(type));recorder=new MediaRecorderClass(stream,mime?{mimeType:mime}:undefined);
    recorder.ondataavailable=event=>{if(canceled||!event.data?.size)return;size+=event.data.size;if(size>maxBytes){failure(Error('Запись слишком большая. Запишите более короткую реплику.'));return;}chunks.push(event.data);};
    recorder.onerror=event=>failure(event.error??Error('Микрофон перестал отвечать. Повторите запись.'));
    recorder.onstop=()=>{release();if(canceled)rejectStop(aborted());else{resolveStop(new Blob(chunks,{type:recorder.mimeType||'audio/webm'}));if(!finishing)onLimit();}chunks=[];};
    recorder.start(250);const beginning=now();onState('recording');timer=interval(()=>{const elapsed=(now()-beginning)/1000;onElapsed(Math.min(maxSeconds,Math.floor(elapsed)));if(elapsed>=maxSeconds){clear(timer);timer=null;onLimit();}},250);
   }catch(error){dispose();throw error;}
  },
  finish(){
   if(finishPromise)return finishPromise;
   finishing=true;
   finishPromise=(async()=>{if(canceled||!recorder)throw aborted();onState('processing');if(recorder.state!=='inactive')recorder.stop();const blob=await stopped;if(canceled)throw aborted();if(!blob.size)throw Error('Запись пустая. Запишите реплику ещё раз.');const context=new AudioContextClass();try{const audio=await context.decodeAudioData(await blob.arrayBuffer());if(canceled)throw aborted();return new File([pcmMonoWav(audio,maxSeconds)],`Голос-${Date.now()}.wav`,{type:'audio/wav'});}finally{await context.close();}})();return finishPromise;
  },
  cancel(){if(canceled)return;canceled=true;rejectStop(aborted());dispose();},
 };
}
