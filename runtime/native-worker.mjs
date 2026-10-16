// Transitional compiler worker. Native window, storage and dialogs live in Rust.
import fs from 'node:fs/promises';
import { buildGame, runPreview } from './builder.mjs';
import { assertProjectShape } from './project-format.mjs';
const request = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
try {
  assertProjectShape(request.project);
  const result = request.operation === 'build'
    ? await buildGame(request.project, request.platform, request.options)
    : await runPreview(request.project, request.options);
  await fs.writeFile(process.argv[3], JSON.stringify({result}));
} catch (error) {
  await fs.writeFile(process.argv[3], JSON.stringify({error:error.message}));
  process.exitCode=1;
}
