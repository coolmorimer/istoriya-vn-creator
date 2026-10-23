import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

// Reviewed publication-only delta, not permission to refresh application QA hashes.
const baseline = '9193b3e8deb4f43a35dd9d5299983c4bf15cfed9';
const tools = ['scripts/prepare-public-release.mjs', 'scripts/publish-github-release.ps1'];
const ownPath = 'scripts/verify-release038-source.mjs';
const allowed = new Set([...tools, ownPath, 'AGENTS.md', 'CHANGELOG.md', 'README.md', 'docs/INSTALL.md', 'docs/PUBLISHING.md', 'docs/README.md', 'docs/RELEASE_0.2.38.md', 'docs/releases/0.2.38.md']);
const [input, output] = process.argv.slice(2);
assert.ok(input && output, 'Usage: node scripts/verify-release038-source.mjs acceptance.json publication.json');
const git = (...args) => execFileSync('git', args);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(git('status', '--porcelain').toString().trim(), '', 'Commit publication changes first');
const changed = git('diff', '--name-only', baseline, 'HEAD').toString().trim().split(/\r?\n/).filter(Boolean);
assert.ok(changed.length > 0);
for (const file of changed) assert.ok(allowed.has(file), `Application changed; repeat EXE acceptance: ${file}`);
const accepted = JSON.parse((await fs.readFile(input, 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(accepted.version, '0.2.38');
assert.equal(hash(await fs.readFile('src-tauri/target/release/istoriya.exe')), accepted.binarySha256);
const sourceHashes = { ...accepted.sourceHashes };
for (const [file, expected] of Object.entries(accepted.sourceHashes)) {
  const current = hash(await fs.readFile(file));
  if (!tools.includes(file)) assert.equal(current, expected, `Accepted source changed: ${file}`);
  else {
    const blob = git('show', `${baseline}:${file}`);
    const lf = blob.toString('utf8').replace(/\r\n/g, '\n');
    assert.ok([hash(blob), hash(Buffer.from(lf)), hash(Buffer.from(lf.replace(/\n/g, '\r\n')))].includes(expected), `Acceptance baseline mismatch: ${file}`);
    sourceHashes[file] = current;
  }
}
sourceHashes[ownPath] = hash(await fs.readFile(ownPath));
const result = { ...accepted, sourceHashes, acceptanceSourceCommit: baseline, publicationOnlySourceChanges: changed };
try { await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); }
catch (error) {
  if (error.code !== 'EEXIST') throw error;
  assert.deepEqual(JSON.parse(await fs.readFile(output, 'utf8')), result, 'Refusing to replace a different publication receipt');
}
console.log(JSON.stringify({ passed: true, baseline, unchangedApplicationSources: Object.keys(accepted.sourceHashes).length - tools.length, publicationOnlySourceChanges: changed, binarySha256: accepted.binarySha256 }));
