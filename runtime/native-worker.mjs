// Transitional source emitter only. Native build/preview orchestration, GUI
// generation, SDK processes and package publication are owned by Rust.
import fs from 'node:fs/promises';
import { compileProject } from './compiler.mjs';
import { assertProjectShape } from './project-format.mjs';
const request = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
try {
  assertProjectShape(request.project);
  if(request.operation!=='compile'||!request.options?.preparedGui)throw Error('Нативный компонент принимает только генерацию сценария с подготовленным интерфейсом.');
  const result = await compileProject(request.project, request.destination, request.options);
  await fs.writeFile(process.argv[3], JSON.stringify({result}));
} catch (error) {
  await fs.writeFile(process.argv[3], JSON.stringify({error:error.message}));
  process.exitCode=1;
}
