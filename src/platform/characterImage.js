export function assertCharacterImageFile(file) {
 if(!file)throw Error('Выберите изображение.');
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Выберите PNG, WebP или JPEG.');
 if(!file.size)throw Error('Файл пустой. Выберите другое изображение.');
 if(file.size>100*1024*1024)throw Error('Изображение больше 100 МБ. Уменьшите файл и повторите загрузку.');
}

export async function readCharacterImage(file) {
 assertCharacterImageFile(file);
 const source=await (window.istoriya?.importFile?.(file)??new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Не удалось прочитать файл. Выберите его повторно.'));reader.readAsDataURL(file);
 }));
 const image=new Image();image.src=source;
 try{await image.decode();}catch{throw Error('Файл не удалось открыть как изображение. Выберите исправный PNG, WebP или JPEG.');}
 if(!image.naturalWidth||!image.naturalHeight)throw Error('Не удалось определить размер изображения.');
 return {name:file.name.replace(/\.[^.]+$/,''),fileName:file.name,source,mime:file.type,size:file.size,width:image.naturalWidth,height:image.naturalHeight,category:'sprite'};
}
