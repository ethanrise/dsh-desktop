#!/usr/bin/env node
/** Reuse platform-independent templates rendered by the matching official release.
 * Linux has no native LibreOfficeKit package; copying source examples alone would
 * omit recalculation, previews, revisions and the runtime catalogue.
 */
import { mkdtemp, rename, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const project = resolve(process.argv[2] ?? '.')
const tag = process.env.UPSTREAM_TAG
if (!/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag ?? '')) throw new Error('UPSTREAM_TAG is required')
const repo = process.env.UPSTREAM_REPO ?? 'dataelement/dsh-desktop'
const response = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
  headers: process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {},
  signal: AbortSignal.timeout(60_000)
})
if (!response.ok) throw new Error(`Official release lookup: HTTP ${response.status}`)
const release = await response.json()
const asset = release.assets.find(x => x.name === 'dsh-desktop-mac-arm64.zip')
if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? '')) throw new Error('No checksummed official template archive')
const { downloadAsset } = await import(pathToFileURL(join(project, 'scripts/office-runtime/prepare.mjs')).href)
const archive = await downloadAsset(asset.browser_download_url, asset.digest.slice(7), join(project, '.build/office-downloads'))
const runtime = join(project, '.build/office-runtime')
const staging = await mkdtemp(join(runtime, '.templates-'))
try {
  // Extract only templates; never copy the macOS interpreter or native runtime.
  await promisify(execFile)('python3', ['-c', `
import pathlib, stat, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    matches = [x for x in archive.namelist() if x.endswith('.app/Contents/Resources/office-runtime/templates/catalog.json')]
    if len(matches) != 1: raise RuntimeError('Expected exactly one official template catalogue')
    prefix = matches[0][:-len('catalog.json')]
    for item in archive.infolist():
        if not item.filename.startswith(prefix): continue
        relative = item.filename[len(prefix):]
        if not relative: continue
        parts = relative.rstrip('/').split('/')
        if any(p in ('', '.', '..') for p in parts) or '\\\\' in relative: raise RuntimeError('Unsafe template path')
        mode = item.external_attr >> 16
        if stat.S_ISLNK(mode): raise RuntimeError('Template symlink')
        destination = pathlib.Path(sys.argv[2]).joinpath(*parts)
        if item.is_dir(): destination.mkdir(parents=True, exist_ok=True)
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(item) as source, destination.open('xb') as target:
                import shutil
                shutil.copyfileobj(source, target)
`, archive, staging], { timeout: 120_000 })
  const { verifyTemplates } = await import('./verify-templates.mjs')
  await verifyTemplates(project, staging)
  await rm(join(runtime, 'templates'), { recursive: true, force: true })
  await rename(staging, join(runtime, 'templates'))
  console.log(`Office templates staged from ${repo}@${tag}, archive ${asset.digest}`)
} finally {
  await rm(staging, { recursive: true, force: true })
}
