export function propImagePoint(layer,frame,imageWidth,imageHeight,clientX,clientY) {
 const width=frame.width*(layer.width??60)/100,height=frame.height*(layer.height??45)/100,scale=(layer.scale??100)/100;
 if(!imageWidth||!imageHeight||!width||!height||!scale)return null;
 const dx=clientX-frame.left-frame.width*(layer.x??50)/100,dy=clientY-frame.top-frame.height*(layer.y??100)/100,angle=(layer.rotation??0)*Math.PI/180;
 const x=(dx*Math.cos(angle)+dy*Math.sin(angle))/(scale*(layer.flip?-1:1))+width/2,y=(-dx*Math.sin(angle)+dy*Math.cos(angle))/scale+height;
 const fit=Math.min(width/imageWidth,height/imageHeight),pixelX=(x-(width-imageWidth*fit)/2)/fit,pixelY=(y-(height-imageHeight*fit))/fit;
 return pixelX>=0&&pixelX<imageWidth&&pixelY>=0&&pixelY<imageHeight?{x:Math.floor(pixelX),y:Math.floor(pixelY)}:null;
}
const masks=new WeakMap();
export function opaquePropHit(image,layer,event,frame) {
 const point=propImagePoint(layer,frame,image.naturalWidth,image.naturalHeight,event.clientX,event.clientY);if(!point)return false;
 try {
  let mask=masks.get(image);
  if(!mask||mask.source!==image.src){const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);mask={source:image.src,context};masks.set(image,mask);}
  return mask.context.getImageData(point.x,point.y,1,1).data[3]>0;
 }catch{return false;}
}
