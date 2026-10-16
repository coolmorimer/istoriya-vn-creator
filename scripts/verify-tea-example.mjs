import fs from 'node:fs/promises';
import path from 'node:path';
import {compileProject} from '../runtime/compiler.mjs';
const project=JSON.parse(await fs.readFile('examples/tea-with-goblins/Чай вместо подвига.vnproject','utf8'));
console.log(await compileProject(project,path.resolve('.artifacts/tea-text-runtime'),{sdkPath:path.resolve('../renpy-8.5.3-sdk'),assetsRoot:path.resolve('public')}));
