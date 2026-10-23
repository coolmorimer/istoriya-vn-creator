import fs from 'node:fs/promises';
import { createReadStream, constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { assertProjectShape } from '../runtime/project-format.mjs';

// Explicit 0.2.35 supply list. No recursive copying of a release or QA directory.
const args = process.argv.slice(2);
function argument(name) {
  const i = args.indexOf(name);
  assert.ok(i >= 0 && args[i + 1] && !args[i + 1].startsWith('--'), `Required: ${name}`);
  return path.resolve(args[i + 1]);
}
const release = argument('--directory');
const verification = argument('--verification');
const previous = argument('--previous');
const read = async file => JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
async function hash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
const pkg = await read('package.json');
assert.equal(pkg.version, '0.2.35', 'Supply list must be reviewed for a new version');
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'Commit source before preparing release');
const accepted = await read(verification);
const packaging = await read(path.join(release, 'packaging-manifest.json'));
for (const data of [accepted, packaging]) assert.equal(data.version, pkg.version);
const binaryHash = await hash('src-tauri/target/release/istoriya.exe');
assert.equal(binaryHash, accepted.binarySha256);
assert.equal(binaryHash, packaging.binarySha256);
for (const [name, digest] of Object.entries(accepted.sourceHashes)) assert.equal(await hash(name), digest, `Source changed: ${name}`);
const runtime = await read('.artifacts/native-runtime-check.json');
assert.equal(runtime.version, pkg.version);
assert.equal(Object.keys(runtime.files).length, accepted.runtimeModules);
for (const [name, digest] of Object.entries(runtime.files)) {
  for (const dir of ['runtime', path.join(runtime.destination, 'runtime'), path.join(runtime.source, 'runtime')]) assert.equal(await hash(path.join(dir, name)), digest, `Runtime changed: ${name}`);
}
for (const key of ['actualUiBuild', 'newProjectEmptyAfterBuild', 'freshNativeProcessReopen', 'poisonedLegacyBuilderAndGuiPassed', 'nativePreviewMainMenu', 'nativePreviewPersistentAcrossGeneratedJobs']) assert.equal(accepted[key], true, key);
for (const key of ['ownerProfileChanged', 'osMouseAutomation', 'fullRustCompiler', 'fullRustRuntime', 'fullProductionAccepted']) assert.equal(accepted[key], false, key);
for (const phase of Object.values(accepted.phases)) assert.equal(phase.exitCode, 0);
const old = await read(path.join(previous, 'release-manifest.json'));
assert.equal(old.version, '0.2.34');
const copied = ['Istoriya-0.2.34-Manual.zip', 'Istoriya-0.2.34-guide.pdf', 'Istoriya-0.2.34-guide.html', 'tea-adventure.vnproject', 'tea-adventure-win.zip', 'tea-layered.vnproject', 'tea-interactive.vnproject'];
const output = path.join(release, 'public');
await fs.mkdir(output, { recursive: true });
async function put(name, bytes) {
  const target = path.join(output, name);
  try { await fs.writeFile(target, bytes, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    assert.deepEqual(await fs.readFile(target), Buffer.from(bytes), `Refusing to replace ${name}`);
  }
}
const records = [];
for (const name of [packaging.installer, ...copied]) {
  assert.ok(name === `Istoriya-Rust-Setup-${pkg.version}-x64.exe` || copied.includes(name), 'Invalid supply filename');
  const inherited = name !== packaging.installer;
  const source = path.join(inherited ? previous : release, name);
  const expected = inherited ? old.files.find(file => file.name === name)?.sha256 : packaging.installerSha256;
  assert.match(expected ?? '', /^[0-9a-f]{64}$/);
  assert.equal(await hash(source), expected, `Supply changed: ${name}`);
  if (name.endsWith('.vnproject')) {
    const project = await read(source);
    assertProjectShape(project);
    function check(value) {
      if (typeof value === 'string') assert.doesNotMatch(value, /^(?:[a-z]:[\\/]|file:\/\/|https?:\/\/(?:localhost|127\.0\.0\.1))/i, `Nonportable path: ${name}`);
      else if (value && typeof value === 'object') Object.values(value).forEach(check);
    }
    check(project);
  }
  const destination = path.join(output, name);
  try { await fs.copyFile(source, destination, constants.COPYFILE_EXCL); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  assert.equal(await hash(destination), expected, `Refusing changed destination: ${name}`);
  records.push({ name, bytes: (await fs.stat(destination)).size, sha256: expected, originVersion: inherited ? '0.2.34' : pkg.version });
}
const manifest = {
  version: pkg.version,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceRepository: 'https://github.com/coolmorimer/istoriya-vn-creator',
  channel: 'beta', platform: 'windows-x64',
  applicationBuiltAt: packaging.createdAt,
  binarySha256: binaryHash, installerSha256: packaging.installerSha256,
  sourceHashes: accepted.sourceHashes,
  localAcceptance: Object.fromEntries(['jsTests', 'rustTests', 'sitesTests', 'runtimeModules', 'packagedCases', 'packagedAssertions', 'ordinaryGameStartups', 'actualUiBuild', 'newProjectEmptyAfterBuild', 'freshNativeProcessReopen', 'nativePreviewMainMenu', 'nativePreviewPersistentAcrossGeneratedJobs'].map(key => [key, accepted[key]])),
  limitations: { installerSigned: false, cleanWindowsInstallationVerified: false, installerUpgradeVerified: false, hostedCiAccepted: false, fullRustCompiler: false, ownRustGameRuntime: false, fullProductionAccepted: false, androidAccepted: false, previewTempCleanupImplemented: false },
  privacy: { rawQaProfilesIncluded: false, ownerProjectsIncluded: false, credentialsIncluded: false },
  manual: { version: '0.2.34', unchanged: true, pages: old.manual.pages, sections: old.manual.sections, distinctScreenshots: old.manual.distinctScreenshots },
  files: records,
};
await put('release-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
const sums = [...records, { name: 'release-manifest.json', sha256: await hash(path.join(output, 'release-manifest.json')) }];
await put('SHA256SUMS.txt', sums.map(file => `${file.sha256}  ${file.name}`).join('\n') + '\n');
assert.deepEqual((await fs.readdir(output)).sort(), [...sums.map(file => file.name), 'SHA256SUMS.txt'].sort(), 'Unexpected file in public supply');
console.log(JSON.stringify({ passed: true, directory: output, sourceCommit: manifest.sourceCommit, assets: sums.length + 1, installerSha256: packaging.installerSha256 }, null, 2));
