// Closed <details> descendants can retain layout rects in Chromium/WebView2.
// A rect alone is not proof of visibility or keyboard reachability.
export function visibleDialogControl(element){
 if(!element?.getClientRects?.().length)return false;
 const closed=element.closest?.('details:not([open])');
 if(closed&&element!==closed.querySelector('summary'))return false;
 return typeof element.checkVisibility!=='function'||element.checkVisibility({visibilityProperty:true});
}
export function holdDialogActionFocus(root){
 const previous=root?.ownerDocument?.activeElement;
 if(!previous||!root.contains(previous))return()=>{};
 // Disabling the focused button makes WebView2 focus <body>. Keep Escape/Tab
 // inside the dialog until the asynchronous action is acknowledged.
 root.focus({preventScroll:true});
 return()=>{if(root.isConnected&&root.ownerDocument.activeElement===root&&previous.isConnected&&!previous.disabled)previous.focus({preventScroll:true});};
}
