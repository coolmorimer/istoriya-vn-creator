import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Read only the publication candidate, never ignored owner projects or QA profiles.
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const problems = [];
let bytes = 0;
let localLinks = 0;
for (const name of files) {
  if (/(?:^|\/)(?:node_modules|target|gen|\.artifacts|output|saves|profiles)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|(?:^|\/)design-qa\.md$|\.(?:exe|zip|log|keystore|jks|pfx|p12|pem)$/i.test(name)) {
    problems.push(`Excluded publication file: ${name}`);
    continue;
  }
  if (name.endsWith('.vnproject') && name !== 'examples/tea-with-goblins/Чай вместо подвига.vnproject') {
    problems.push(`Generated or private project: ${name}`);
    continue;
  }
  const stat = await fs.lstat(name);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size >= 100 * 1024 * 1024) {
    problems.push(`Unsupported Git file: ${name}`);
    continue;
  }
  bytes += stat.size;
  if (!/\.(?:js|jsx|mjs|rs|json|md|ya?ml|ps1|iss|toml|html|css|py|lock)$/i.test(name)) continue;
  const content = await fs.readFile(name, 'utf8');
  if (/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-)?[A-Za-z0-9_-]{35,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(content)) problems.push(`Potential credential in ${name}`);
  if (['README.md', 'PROJECT_MAP.md', 'docs/README.md', 'docs/INSTALL.md', 'docs/DEVELOPMENT.md', 'docs/PUBLISHING.md', 'docs/releases/0.2.35.md'].includes(name)) {
    for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
      const href = match[1];
      if (/^(?:https?:|#)/.test(href)) continue;
      localLinks++;
      if (!await fs.access(path.resolve(path.dirname(name), href.split('#')[0])).then(() => true, () => false)) problems.push(`Broken link: ${name} -> ${href}`);
    }
  }
}
console.log(JSON.stringify({ files: files.length, bytes, localLinks, problems }, null, 2));
if (problems.length) process.exitCode = 1;
