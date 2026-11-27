// Stage a self-contained local bundle for the Desktop plugin installer.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const name = 'dsh-cua-linux'
const version = '0.3.0'
const output = resolve(process.argv[2])
const scratch = mkdtempSync(join(tmpdir(), 'dsh-linux-cua-'))
const source = join(scratch, 'package')
const run = (file, args, cwd = scratch) => execFileSync(file, args, { cwd, stdio: 'inherit' })

try {
  run('npm', ['pack', `${name}@${version}`, '--ignore-scripts'])
  run('tar', ['-xzf', `${name}-${version}.tgz`])
  const manifest = join(source, 'package.json')
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
  if (pkg.name !== name || pkg.version !== version || pkg.dsh?.bundle?.patch !== './cordis.patch.yml') {
    throw new Error('Unexpected computer-use plugin manifest')
  }
  pkg.bundleDependencies = Object.keys(pkg.dependencies ?? {})
  writeFileSync(manifest, JSON.stringify(pkg, null, 2) + '\n')
  run('npm', ['install', '--omit=dev', '--omit=peer', '--ignore-scripts', '--no-audit', '--no-fund'], source)
  mkdirSync(output, { recursive: true })
  run('npm', ['pack', '--ignore-scripts', '--pack-destination', output], source)
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
