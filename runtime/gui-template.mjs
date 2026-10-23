import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {runtimeException} from './runtime-verification.mjs';

export function validateGameGui(value) {
  if(!value||typeof value.gui!=='string'||!value.gui.trim()||typeof value.screens!=='string'||!value.screens.trim())throw Error('Не подготовлен интерфейс игры.');
  if(/gui\s*\.\s*scale\s*\(/.test(value.gui)||/gui7/.test(value.gui))throw Error('Генератор вернул служебный шаблон вместо игрового интерфейса.');
  return value;
}

async function guiCommand(sdkPath, args, saves) {
  const executable=path.join(sdkPath,'lib/py3-windows-x86_64/python.exe');
  const child=spawn(executable,[path.join(sdkPath,'renpy.py'),...args],{cwd:sdkPath,windowsHide:true,shell:false,env:{...process.env,RENPY_PATH_TO_SAVES:saves}});
  let output='';
  child.stdout.on('data',chunk=>{output+=chunk.toString();});
  child.stderr.on('data',chunk=>{output+=chunk.toString();});
  const timer=setTimeout(()=>child.kill(),90_000);
  try {
    const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
    if(code!==0||runtimeException(output))throw Error(`Не удалось подготовить интерфейс игры (${code}). ${output.slice(-4000)}`);
  } finally {clearTimeout(timer);}
}

export async function generateGameGui(sdkPath,gameDir,width,height) {
  // SDK gui/game is a generator template, not a distributable game UI.
  // Run the official generator at build time, in a fresh owned directory.
  const staging=await fs.mkdtemp(path.join(os.tmpdir(),'istoriya-gui-'));
  try {
    await fs.mkdir(path.join(staging,'game'));
    await guiCommand(sdkPath,['launcher','generate_gui',staging,'--template',path.join(sdkPath,'gui'),'--width',String(width),'--height',String(height),'--start'],path.join(staging,'saves'));
    await guiCommand(sdkPath,[staging,'gui_images'],path.join(staging,'saves'));
    const generated=path.join(staging,'game');
    await fs.cp(path.join(generated,'gui'),path.join(gameDir,'gui'),{recursive:true,force:true});
    const gui=await fs.readFile(path.join(generated,'gui.rpy'),'utf8');
    const screens=await fs.readFile(path.join(generated,'screens.rpy'),'utf8');
    return validateGameGui({gui,screens});
  } finally {
    // Only this freshly allocated compiler-owned staging directory is removed.
    await fs.rm(staging,{recursive:true,force:true});
  }
}
