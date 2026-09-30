import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { rm } from 'node:fs/promises'
import { DEVELOPER_INSTALL_PATH, githubTarget, localTarget } from '../packages/dsh-desktop-market-installer/developer-installer.mjs'

const roots = []
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))))

describe('developer plugin installer', () => {
  it('uses a stable loopback route', () => {
    expect(DEVELOPER_INSTALL_PATH).toBe('/dsh-desktop/developer-plugin/install')
  })

  it('accepts a local DSH plugin and preserves its absolute source path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-developer-plugin-'))
    roots.push(root)
    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: 'demo-plugin', version: '1.2.3', dsh: { bundle: './index.js' }
    }))
    await writeFile(join(root, 'index.js'), 'export function apply() {}\n')
    await expect(localTarget(root)).resolves.toMatchObject({
      name: 'demo-plugin', version: '1.2.3', pluginSpec: `file:${root}`
    })
  })

  it('rejects local packages that are not DSH plugins', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-developer-plugin-'))
    roots.push(root)
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'plain-package', version: '1.0.0' }))
    await expect(localTarget(root)).rejects.toThrow('dsh.bundle')
  })

  it('pins GitHub installs to the default branch commit', async () => {
    const responses = [
      { ok: true, json: async () => ({ default_branch: 'main' }) },
      { ok: true, json: async () => ({ sha: '0123456789abcdef0123456789abcdef01234567' }) },
      { ok: true, json: async () => ({ name: 'github-plugin', version: '2.0.0', dsh: { bundle: './index.js' } }) }
    ]
    const fetchImpl = async () => responses.shift()
    await expect(githubTarget('https://github.com/example/github-plugin', fetchImpl)).resolves.toMatchObject({
      name: 'github-plugin',
      version: '2.0.0',
      pluginSpec: 'github:example/github-plugin#0123456789abcdef0123456789abcdef01234567'
    })
  })
})
