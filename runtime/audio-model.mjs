// Shared audio semantics. Author volume never overwrites the player's mixer.
export const AUDIO_CHANNELS=['music','sound','voice','ambience'];
// MIME is authoritative when present. Older projects identified recordings
// by category; authoring and pre-build validation must agree on those files.
export const isAudioResource=resource=>!!resource?.source&&(resource.mime?resource.mime.startsWith('audio/'):AUDIO_CHANNELS.includes(resource.category));
export const audioVolume=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(1,Number(value))):1;
export const audioFade=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(60,Number(value))):0;
export function voiceFilename(filename,volume=1){const level=audioVolume(volume);return level===1?filename:`<volume ${level}>${filename}`;}
export function audioProblems(record){
 const problems=[];
 for(const key of ['volume','soundVolume','voiceVolume'])if(record[key]!=null&&(typeof record[key]!=='number'||!Number.isFinite(record[key])||record[key]<0||record[key]>1))problems.push('Громкость должна быть от 0 до 100%.');
 for(const key of ['fadeIn','fadeOut'])if(record[key]!=null&&(typeof record[key]!=='number'||!Number.isFinite(record[key])||record[key]<0||record[key]>60))problems.push('Длительность затухания должна быть от 0 до 60 секунд.');
 if(record.type==='stopAudio'&&!AUDIO_CHANNELS.includes(record.channel))problems.push('Выберите, какой звук нужно остановить.');
 return problems;
}
