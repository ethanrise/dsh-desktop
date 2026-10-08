#!/usr/bin/env node
/**
 * Build-time fixes to installed dependencies (node_modules only; upstream
 * source is untouched). Each fix is guarded: if the code no longer matches,
 * it is skipped with a warning, never a failure.
 *
 * libreoffice-kit: on Linux it is meant to fall back to its WASM engine when
 * no native engine package is installed. Its "is the package present" probe
 * compares `lstatSync(p, { throwIfNoEntry: false }) !== undefined`, but
 * Electron's asar fs returns `null` for a missing path inside app.asar, so the
 * missing native package is reported as "installed but incomplete" and the
 * WASM fallback is never reached. Compare with `!= null` instead.
 *
 * Usage: node patch-deps.mjs <upstream checkout>
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const project = resolve(process.argv[2] ?? '.')
const kit = join(project, 'node_modules/@deepseek-ai/libreoffice-kit/lib')
const before = 'lstatSync(join(directory, name), { throwIfNoEntry: false }) !== void 0'
const after = 'lstatSync(join(directory, name), { throwIfNoEntry: false }) != null'

for (const file of ['cli.js', 'index.js']) {
  const path = join(kit, file)
  let source
  try { source = await readFile(path, 'utf8') } catch { console.log(`::warning::libreoffice-kit ${file} not found; skipping asar probe fix`); continue }
  if (source.includes(after)) { console.log(`libreoffice-kit ${file}: already fixed`); continue }
  if (!source.includes(before)) { console.log(`::warning::libreoffice-kit ${file}: probe code changed; skipping asar probe fix`); continue }
  await writeFile(path, source.replace(before, after))
  console.log(`libreoffice-kit ${file}: patched asar package probe`)
}
