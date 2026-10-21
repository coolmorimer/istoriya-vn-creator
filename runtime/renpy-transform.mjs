// RenPy distinguishes absolute integer positions from relative float positions.
export function renpyFloat(value) {
 const number=Number(value);
 if(!Number.isFinite(number))throw Error('Некорректное число трансформации.');
 return Number.isInteger(number)?`${number}.0`:String(number);
}
export function renpyActorTransform(layer) {
 const x=layer.x??({left:25,center:50,right:75})[layer.position]??50;
 return `Transform(xpos=${renpyFloat(x/100)}, ypos=${renpyFloat((layer.y??100)/100)}, xanchor=0.5, yanchor=1.0, zoom=${(layer.scale??100)/100}, rotate=${layer.rotation??0}, alpha=${(layer.opacity??100)/100}, xzoom=${layer.flip?-1:1}, blur=${layer.blur??0}, rotate_pad=False, transform_anchor=True)`;
}
