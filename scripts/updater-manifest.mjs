// Write latest.json, the manifest the in-app updater reads from main-latest, for one release.
// Usage: node scripts/updater-manifest.mjs <version> <release-tag> <notes> <artifact-dir> > latest.json
// Every signed update in <artifact-dir> (a file with a matching .sig) becomes a platform entry.
// Its URL points at the tagged release, which never changes after publishing.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [version, tag, notes, dir] = process.argv.slice(2);
if (!version || !tag || !dir)
  throw new Error('usage: updater-manifest.mjs <version> <tag> <notes> <dir>');

// The updater looks up `<os>-<arch>-<installer>` first, then `<os>-<arch>`.
const kinds = [
  { suffix: '.app.tar.gz', platforms: ['darwin-aarch64', 'darwin-x86_64'] },
  { suffix: '.AppImage', platforms: ['linux-x86_64-appimage', 'linux-x86_64'] },
  { suffix: '.deb', platforms: ['linux-x86_64-deb'] },
];
const files = readdirSync(dir);
const platforms = {};
for (const { suffix, platforms: keys } of kinds) {
  const file = files.find((f) => f.endsWith(suffix) && files.includes(`${f}.sig`));
  if (!file) continue;
  const entry = {
    signature: readFileSync(join(dir, `${file}.sig`), 'utf8').trim(),
    url: `https://github.com/varvand/lumen/releases/download/${tag}/${encodeURIComponent(file)}`,
  };
  for (const key of keys) platforms[key] = entry;
}
if (!Object.keys(platforms).length) throw new Error(`No signed updates found in ${dir}`);
console.log(
  JSON.stringify({ version, notes, pub_date: new Date().toISOString(), platforms }, null, 2),
);
