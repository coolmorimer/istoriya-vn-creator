export async function readFontFile(file){
 if(!file||!/\.(ttf|otf)$/i.test(file.name))throw Error('Выберите TTF или OTF.');
 if(!file.size||file.size>25*1024*1024)throw Error('Шрифт пустой или больше25 МБ.');
 const bytes=await file.arrayBuffer();await new FontFace('istoriya-validation',bytes).load();
 const mime=/\.otf$/i.test(file.name)?'font/otf':'font/ttf';
 const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Не удалось прочитать шрифт.'));reader.readAsDataURL(new Blob([bytes],{type:mime}));});
 return {name:file.name,source,mime,size:file.size,category:'font'};
}
