export function textAppearance(project, action) {
  const ui=project.ui ?? {};
  return {font:'DejaVuSans.ttf',size:ui.dialogueFontSize??32,color:ui.dialogueTextColor??'#ffffff',speed:ui.textSpeed??35,outline:0,outlineColor:'#000000',shadow:false,bold:false,italic:false,underline:false,...ui.textStyle,
    ...(action?.type==='narration'?{size:ui.narratorFontSize??30,color:ui.narratorTextColor??'#e6e6ef'}:{}),...action?.textStyle};
}
