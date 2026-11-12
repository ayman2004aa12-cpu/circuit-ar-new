// Static deployment audit; no dependencies, network requests or generated assets.
import {readFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, resolve, relative, sep, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const vendorRoot = resolve(root, 'vendor');
const issues = [];
const checked = new Set();
const queue = [];
const runtimeReferences = new Set();
let verifiedHashes = 0;

function inside(base, candidate) {
  const rel = relative(base, candidate);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep);
}

async function readAsset(path) {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size === 0) throw new Error('missing file content');
    const data = await readFile(path);
    if (data.subarray(0, 100).toString().startsWith('version https://git-lfs.github.com/spec/v1')) {
      throw new Error('Git LFS pointer instead of asset bytes');
    }
    return data;
  } catch (error) {
    issues.push(`${relative(root, path)}: ${error.message}`);
    return null;
  }
}

async function reference(specifier, from, {runtime = true} = {}) {
  if (!specifier || specifier.startsWith('#')) return;
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(specifier)) {
    if (runtime) issues.push(`${relative(root, from)}: remote runtime dependency ${specifier}`);
    return;
  }
  if (specifier.startsWith('/')) {
    issues.push(`${relative(root, from)}: root-relative path breaks project GitHub Pages: ${specifier}`);
    return;
  }
  const clean = specifier.split(/[?#]/, 1)[0];
  const path = resolve(dirname(from), decodeURIComponent(clean));
  if (!inside(root, path)) {
    issues.push(`${relative(root, from)}: asset escapes project: ${specifier}`);
    return;
  }
  if (!runtimeReferences.has(path)) {
    runtimeReferences.add(path);
    if (await readAsset(path)) queue.push(path);
  }
}

async function auditSource(path) {
  if (checked.has(path)) return;
  checked.add(path);
  const data = await readAsset(path);
  if (!data) return;
  const source = data.toString();
  const extension = extname(path);
  if (extension === '.html') {
    for (const match of source.matchAll(/<(script|link|img|source|video|audio|iframe|a)\b([^>]*)>/gi)) {
      const tag = match[1].toLowerCase();
      for (const attribute of match[2].matchAll(/\b(src|href|poster)\s*=\s*(["'])(.*?)\2/gi)) {
        await reference(attribute[3], path, {runtime: tag !== 'a'});
      }
    }
  }
  if (extension === '.css') {
    for (const match of source.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) {
      await reference(match[1], path);
    }
  }
  if (['.js', '.mjs'].includes(extension)) {
    // Resolve literal ESM dependencies, including Three.js's separate core file.
    for (const match of source.matchAll(/^\s*(?:import|export)\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']/gm)) {
      await reference(match[1], path);
    }
    // Application loader imports and script URLs are deliberately literal.
    // The unmodified XR binary contains optional remote loaders for features
    // this application does not use; its integrity is audited below instead.
    if (!inside(vendorRoot, path)) {
      for (const match of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)|\.src\s*=\s*["']([^"']+)["']|\bfetch\s*\(\s*["']([^"']+)["']/g)) {
        await reference(match[1] || match[2] || match[3], path);
      }
    }
  }
}

queue.push(resolve(root, 'index.html'));
while (queue.length) await auditSource(queue.shift());

const manifestPath = resolve(vendorRoot, 'manifest.json');
const manifestBytes = await readAsset(manifestPath);
if (manifestBytes) {
  try {
    const manifest = JSON.parse(manifestBytes.toString());
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('manifest.files is empty');
    const seen = new Set();
    for (const record of manifest.files) {
      if (typeof record.path !== 'string' || !Number.isSafeInteger(record.bytes) || !/^[a-f\d]{64}$/i.test(record.sha256)) {
        issues.push('vendor/manifest.json: invalid file record');
        continue;
      }
      const path = resolve(vendorRoot, record.path);
      if (!inside(vendorRoot, path) || seen.has(path)) {
        issues.push(`vendor/manifest.json: duplicate or escaping path ${record.path}`);
        continue;
      }
      seen.add(path);
      const data = await readAsset(path);
      if (!data) continue;
      if (data.length !== record.bytes) issues.push(`${record.path}: byte length differs from manifest`);
      if (createHash('sha256').update(data).digest('hex') !== record.sha256) issues.push(`${record.path}: SHA-256 differs from manifest`);
      verifiedHashes++;
    }
    for (const path of runtimeReferences) {
      if (inside(vendorRoot, path) && !seen.has(path)) issues.push(`${relative(root, path)}: runtime asset missing from vendor manifest`);
    }
    for (const pkg of manifest.packages || []) {
      await reference(`./${pkg.license}`, manifestPath, {runtime: false});
    }
  } catch (error) {
    issues.push(`vendor/manifest.json: ${error.message}`);
  }
}

if (issues.length) {
  console.error(`Asset audit failed (${issues.length}):\n${issues.map(issue => `- ${issue}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Asset audit passed: ${checked.size} source files, ${runtimeReferences.size} local references, ${verifiedHashes} vendor SHA-256 records; no remote application runtime references or Git LFS pointers.`);
}
