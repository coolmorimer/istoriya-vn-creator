export const RESOURCE_GRID={padding:12,gap:12,cardHeight:165,minWidth:145,overscan:2};
export function resourceGridWindow({count,width,height,scrollTop}){
 const {padding,gap,cardHeight,minWidth,overscan}=RESOURCE_GRID;
 const available=Math.max(1,(Number(width)||1)-padding*2),columns=Math.max(1,Math.floor((available+gap)/(minWidth+gap))),cellWidth=(available-gap*(columns-1))/columns,rowHeight=cardHeight+gap,rows=Math.ceil(Math.max(0,count)/columns),totalHeight=padding*2+rows*rowHeight-(rows?gap:0);
 const top=Math.max(0,Math.min(Number(scrollTop)||0,Math.max(0,totalHeight-(Number(height)||1)))),startRow=Math.max(0,Math.floor((top-padding)/rowHeight)-overscan),endRow=Math.min(rows,Math.ceil((top+Math.max(1,Number(height)||1)-padding)/rowHeight)+overscan);
 return {columns,cellWidth,rowHeight,totalHeight,start:startRow*columns,end:Math.min(count,endRow*columns),padding,gap};
}
export function resourceGridScroll(index,grid,top,height){const y=grid.padding+Math.floor(index/grid.columns)*grid.rowHeight;if(y<top)return y;const bottom=y+RESOURCE_GRID.cardHeight;return bottom>top+height?Math.max(0,bottom-height):top;}
