// Exercise the actual Plugin Manager transaction with the bundle and pnpm from the DEB.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const project = resolve(process.argv[2])
const executable = resolve(process.argv[3])
const bundle = resolve(process.argv[4])
const resources = join(dirname(executable), 'resources')
const requireFromProject = createRequire(join(project, 'package.json'))
const { PluginManager } = await import(pathToFileURL(requireFromProject.resolve('@deepseek-ai/dsh-plugin-manager')).href)
const backendPath = join(project, 'packages/dsh-desktop-market-installer/generations/package-backend.mjs')
const { createGenerationPackageBackend } = await import(pathToFileURL(backendPath).href)
const asar = requireFromProject('@electron/asar')
const archive = join(resources, 'app.asar')
for (const [file, marker] of [
  ['out/preload/app.cjs', 'getLinuxComputerUseBundle'],
  ['out/main/index.js', 'desktop-linux-cua:bundle'],
  ['node_modules/dsh-desktop-market-installer/client.js', 'desktop-linux-computer-use']
]) {
  assert.ok(asar.extractFile(archive, file).toString().includes(marker), `Missing computer-use integration in ${file}`)
}
const name = 'dsh-cua-linux'
const version = /-(\d+\.\d+\.\d+)\.tgz$/.exec(bundle)?.[1]
assert.ok(version)

const home = await mkdtemp(join(tmpdir(), 'dsh-linux-cua-verify-'))
const profile = 'desktop'
const dir = join(home, 'profiles', profile)
const manifest = join(dir, 'package.json')

try {
  await mkdir(dir, { recursive: true })
  await writeFile(manifest, JSON.stringify({ private: true, dsh: { profile: { bundles: [] } } }))
  await writeFile(join(dir, 'cordis.patch.yml'), '[]\n')
  const backend = createGenerationPackageBackend({
    dshHome: home, profile,
    nodeExecutablePath: executable,
    pnpmEntryPath: join(resources, 'app.asar.unpacked/node_modules/pnpm/bin/pnpm.cjs'),
    environment: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      npm_config_offline: 'true',
      npm_config_store_dir: join(home, 'store')
    }
  })
  const hmr = {
    runExclusive: async operation => operation(),
    reconcileProfile: async () => ({ warnings: [], pending: [] })
  }
  // Match upstream transaction tests. Desktop boot and HMR are separate checks.
  const manager = Object.assign(Object.create(PluginManager.prototype), {
    profile: { dir, name: profile, startedBundles: [], installAnchor: requireFromProject.resolve('@deepseek-ai/dsh/package.json') },
    ownerContext: { get: key => ({ profileBundlePackageBackend: backend, hmr })[key], emit() {}, async parallel() {} },
    abort: new AbortController(), installs: new Map(), installedFrom: new Map(), packageOperations: new Set(),
    managementBundles: new Set(), ownerEntryId: 'include:manager', lockWaitMs: 1000
  })
  const readManifest = async () => JSON.parse(await readFile(manifest, 'utf8'))
  const selection = async () => (await readManifest()).dsh.profile.bundles
  const assertApplied = result => assert.ok(
    ['applied', 'restart-required'].includes(result.application),
    JSON.stringify(result)
  )

  assert.deepEqual(await selection(), [])
  assertApplied(await manager.installBundle(bundle, { expectedName: name, expectedVersion: version, enabled: true }))
  assert.deepEqual(await selection(), [name])
  const dependency = (await readManifest()).dependencies[name]
  assert.ok(dependency)
  const runtime = JSON.parse(await readFile(join(dir, 'node_modules', name, 'node_modules/x11/package.json'), 'utf8'))
  assert.equal(runtime.name, 'x11')

  assertApplied(await manager.setBundleEnabled(name, false))
  assert.deepEqual(await selection(), [])
  assertApplied(await manager.setBundleEnabled(name, true))
  assert.deepEqual(await selection(), [name])
  assert.equal((await readManifest()).dependencies[name], dependency)
  console.log(`Verified offline install and enable/disable of ${name}@${version}`)
} finally {
  await rm(home, { recursive: true, force: true })
}
