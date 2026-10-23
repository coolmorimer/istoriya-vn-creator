// Transitional source emitter only. Native build/preview orchestration, GUI
// generation, SDK processes and package publication are owned by Rust.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import { compileRustValidatedProject } from './compiler.mjs';
const request = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
try {
  if(request.operation!=='compile'||!request.options?.preparedGui)throw Error('Нативный компонент принимает только генерацию сценария с подготовленным интерфейсом.');
  const validation=request.validatedDocument;
  if(validation?.source!=='istoriya-core'||validation.structureProtocol!==1||!Number.isInteger(validation.schema)||validation.schema<1||validation.schema>8||!/^[0-9a-f]{64}$/.test(validation.sha256??'')||!Number.isSafeInteger(validation.bytes)||validation.bytes<1)throw Error('Нет подтверждения структурной проверки документа Rust-ядром.');
  const body=await fs.readFile(path.join(path.dirname(process.argv[2]),'document.json'));
  if(body.length!==validation.bytes||createHash('sha256').update(body).digest('hex')!==validation.sha256)throw Error('Проверенный документ повреждён при передаче в генератор. Повторите сборку.');
  const result = await compileRustValidatedProject(JSON.parse(body), request.destination, request.options);
  await fs.writeFile(process.argv[3], JSON.stringify({result}));
} catch (error) {
  await fs.writeFile(process.argv[3], JSON.stringify({error:error.message}));
  process.exitCode=1;
}
