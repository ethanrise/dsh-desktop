#!/usr/bin/env node
/**
 * Linux replacement for upstream's `npm run office:prepare`.
 *
 * Upstream (scripts/office-runtime/) only locks mac-* and win-x64 payloads.
 * Rather than patching its source, this script:
 *   1. derives a linux-x64 target from upstream's own lock (same Python
 *      version/release, same package versions) by looking up the Linux
 *      python-build-standalone archive and manylinux wheels and their sha256;
 *   2. adds that target to the in-tree lock.json copy (build-time only);
 *   3. runs upstream's own prepareOfficeRuntime() for it, so skill assets and
 *      the payload layout stay exactly upstream's;
 *   4. fixes runtime.json's platform, which upstream writes as darwin/win32.
 *
 * Usage: node prepare-office.mjs <upstream checkout>
 * If upstream ever ships a linux-x64 target itself, it is used as-is.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const TARGET = 'linux-x64'
const PYTHON_TARGET = 'x86_64-unknown-linux-gnu'
const WHEEL_PLATFORM = /-cp312-cp312-manylinux[^-]*x86_64[^-]*\.whl$/u

const project = resolve(process.argv[2] ?? '.')
const lockPath = join(project, 'scripts/office-runtime/lock.json')
const lock = JSON.parse(await readFile(lockPath, 'utf8'))

async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`)
  return response.json()
}

async function pythonSha256() {
  const filename = `cpython-${lock.pythonVersion}+${lock.pythonRelease}-${PYTHON_TARGET}-install_only_stripped.tar.gz`
  const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${lock.pythonRelease}/SHA256SUMS`
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`)
  const line = (await response.text()).split('\n').find(l => l.trim().endsWith(`  ${filename}`))
  if (!line) throw new Error(`No checksum for ${filename} in ${url}`)
  return line.split(/\s+/u)[0]
}

/** Linux equivalents of the packages upstream locks per platform. */
async function nativeWheels() {
  const reference = lock.targets['win-x64'] ?? Object.values(lock.targets)[0]
  const wheels = []
  for (const { url } of reference.wheels) {
    const [name, version] = decodeURIComponent(url.split('/').pop()).split('-')
    const release = await json(`https://pypi.org/pypi/${name}/${version}/json`)
    const candidates = release.urls.filter(file => WHEEL_PLATFORM.test(file.filename))
    // Prefer the most widely compatible (lowest glibc) manylinux wheel.
    candidates.sort((a, b) => a.filename.localeCompare(b.filename))
    const wheel = candidates.find(file => /manylinux_2_(1[0-9]|2[0-8])|manylinux2014/u.test(file.filename)) ?? candidates[0]
    if (!wheel) throw new Error(`No manylinux x86_64 cp312 wheel for ${name} ${version}`)
    wheels.push({ url: wheel.url, sha256: wheel.digests.sha256 })
    console.log(`  ${wheel.filename}`)
  }
  return wheels
}

if (!lock.targets[TARGET]) {
  console.log(`Deriving ${TARGET} Office runtime lock from upstream (Python ${lock.pythonVersion}+${lock.pythonRelease})`)
  lock.targets[TARGET] = { pythonTarget: PYTHON_TARGET, pythonSha256: await pythonSha256(), wheels: await nativeWheels() }
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
} else {
  console.log(`Upstream already locks ${TARGET}; using it`)
}

const { prepareOfficeRuntime } = await import(pathToFileURL(join(project, 'scripts/office-runtime/prepare.mjs')).href)
await prepareOfficeRuntime({ target: TARGET })

const manifestPath = join(project, '.build/office-runtime/primary-runtime/runtime.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
manifest.platform = 'linux'
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Office runtime platform set to linux/${manifest.arch}`)
