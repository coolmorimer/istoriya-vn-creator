import fs from 'node:fs/promises';
import path from 'node:path';
// Original deterministic synthesised demo audio, not a third-party recording.
const rate=24000;
export async function prepareTeaAudio(root) {
 await fs.mkdir(root,{recursive:true});
 async function wav(name,seconds,sample){const count=Math.round(seconds*rate),data=Buffer.alloc(44+count*2);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(count*2,40);for(let i=0;i<count;i++){const t=i/rate,fade=Math.min(1,t/.025,(seconds-t)/.025);data.writeInt16LE(Math.round(Math.max(-.94,Math.min(.94,sample(t,i)*fade))*32767),44+i*2);}await fs.writeFile(path.join(root,name),data);}
 const note=m=>440*2**((m-69)/12),pluck=(f,t)=>t<0?0:Math.exp(-t*1.8)*(Math.sin(2*Math.PI*f*t)+.25*Math.sin(4*Math.PI*f*t)+.1*Math.sin(6*Math.PI*f*t));
 const music=chords=>t=>{const chord=chords[Math.floor(t/4)%4],phase=t%4;let value=0;for(let n=0;n<8;n++){const local=phase-n*.5;value+=pluck(note(chord[n%3]+(n%2?12:0)),local)*.1;}value+=Math.sin(2*Math.PI*note(chord[0]-12)*t)*.035;return value;};
 await wav('mystery.wav',16,music([[50,53,57],[46,50,53],[43,46,50],[45,49,52]]));
 await wav('tea-theme.wav',16,music([[53,57,60],[48,52,55],[55,59,62],[57,60,64]]));
 let seed=9127;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296*2-1;};
 let low=0;await wav('rain.wav',12,t=>{const n=random();low=.98*low+.02*n;return(n*.12+low*.75)*(.85+.15*Math.sin(2*Math.PI*t/12));});
 let fire=0;await wav('fire.wav',12,t=>{fire=.93*fire+.07*random();const crack=Math.sin(t*29)> .999?random()*.18:0;return fire*.38+crack;});
 await wav('cup.wav',.7,t=>Math.exp(-t*9)*(.17*Math.sin(2*Math.PI*1290*t)+.1*Math.sin(2*Math.PI*2135*t)));
 await wav('twig.wav',.35,t=>random()*.4*Math.exp(-t*20));
 await wav('magic.wav',.8,t=>Math.sin(2*Math.PI*(420*t+300*t*t))*.18*Math.sin(Math.PI*t/.8));
}
