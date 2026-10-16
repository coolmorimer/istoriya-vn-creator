import {readCharacterImage} from './characterImage.js';
import {readAudioResource} from '../domain/audioAuthoring.js';
import {readFontFile} from './fontFile.js';
export function fileMediaKind(file){const ext=file?.name?.split('.').at(-1)?.toLowerCase();return ['png','jpg','jpeg','webp'].includes(ext)?'image':['mp3','wav','ogg'].includes(ext)?'audio':['ttf','otf'].includes(ext)?'font':ext==='mp4'?'video':null;}
export const mediaAccept={image:'image/png,image/jpeg,image/webp',audio:'.mp3,.wav,.ogg',font:'.ttf,.otf',video:'.mp4'};
export async function readMediaFile(file,{kind,category}={}){
 if(!file)throw Error('Выберите файл.');const actual=fileMediaKind(file);
 if(!actual||kind&&actual!==kind)throw Error(`Файл «${file.name}» не подходит. Выберите ${kind==='audio'?'MP3, WAV или OGG':kind==='font'?'TTF или OTF':kind==='video'?'MP4':'PNG, WebP или JPEG'}.`);
 if(actual==='video')throw Error('Замена видео пока не поддерживается. Исходная запись не изменена.');
 const resource=actual==='image'?await readCharacterImage(file):actual==='audio'?await readAudioResource(file):await readFontFile(file);
 return {...resource,fileName:file.name,category:category??(actual==='image'?'background':actual==='audio'?'sound':'font')};
}
