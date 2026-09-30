import { readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

export const DEVELOPER_INSTALL_PATH = '/dsh-desktop/developer-plugin/install'
const MAX_BODY_BYTES = 16 * 1024
const GITHUB_REPOSITORY = /^https:\/\/github\.com\/([^/]+)\/([^/#]+?)(?:\.git)?\/?$/u

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body)
  })
  res.end(body)
}

async function body(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('Request body is too large.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('package.json must contain an object.')
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) throw new Error('package.json must declare a package name.')
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) throw new Error('package.json must declare a version.')
  if (!manifest.dsh || typeof manifest.dsh !== 'object' || manifest.dsh.bundle === undefined) {
    throw new Error('This package does not declare dsh.bundle and does not look like a DSH plugin.')
  }
  return { name: manifest.name, version: manifest.version }
}

async function githubTarget(url, fetchImpl = fetch) {
  const match = GITHUB_REPOSITORY.exec(url.trim())
  if (!match) throw new Error('Enter a public GitHub repository URL such as https://github.com/owner/repo.')
  const owner = match[1]
  const repo = match[2]
  const repository = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-desktop' },
    signal: AbortSignal.timeout(15_000)
  })
  if (!repository.ok) throw new Error(`GitHub repository lookup returned HTTP ${repository.status}.`)
  const metadata = await repository.json()
  const branch = metadata.default_branch
  if (typeof branch !== 'string' || !branch) throw new Error('GitHub did not return a default branch.')
  const commitResponse = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-desktop' },
    signal: AbortSignal.timeout(15_000)
  })
  if (!commitResponse.ok) throw new Error(`GitHub commit lookup returned HTTP ${commitResponse.status}.`)
  const sha = (await commitResponse.json()).sha
  if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/u.test(sha)) throw new Error('GitHub did not return a valid commit SHA.')
  const manifestResponse = await fetchImpl(`https://raw.githubusercontent.com/${owner}/${repo}/${sha}/package.json`, {
    signal: AbortSignal.timeout(15_000)
  })
  if (!manifestResponse.ok) throw new Error(`package.json lookup returned HTTP ${manifestResponse.status}.`)
  const manifest = await manifestResponse.json()
  const identity = validateManifest(manifest)
  return { ...identity, pluginSpec: `github:${owner}/${repo}#${sha}`, source: `${owner}/${repo}@${sha.slice(0, 12)}` }
}

async function localTarget(input) {
  const path = resolve(input.trim())
  if (!isAbsolute(path)) throw new Error('Local plugin path must be absolute.')
  const manifest = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'))
  const identity = validateManifest(manifest)
  return { ...identity, pluginSpec: `file:${path}`, source: path }
}

async function wait(handle) {
  let output = ''
  const append = chunk => { output = `${output}${chunk.toString('utf8')}`.slice(-16 * 1024) }
  handle.stdout.on('data', append)
  handle.stderr.on('data', append)
  const result = await handle.done
  if (result.exitCode !== 0) {
    const detail = output.trim().split(/\r?\n/u).at(-1)
    throw new Error(detail || `Plugin install exited with code ${result.exitCode}.`)
  }
}

export function registerDeveloperPluginInstaller(ctx, options) {
  const { desktopPnpm, directory, trustedRequest, fetchImpl = fetch } = options
  return ctx.inject(['webServer'], webCtx => webCtx.effect(() =>
    webCtx.webServer.register({
      kind: 'exact',
      path: DEVELOPER_INSTALL_PATH,
      handler: async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' })
        if (!trustedRequest(req, true)) return json(res, 403, { error: 'Request rejected.' })
        try {
          const request = await body(req)
          const target = request.kind === 'github'
            ? await githubTarget(String(request.value || ''), fetchImpl)
            : request.kind === 'local'
              ? await localTarget(String(request.value || ''))
              : (() => { throw new Error('Install source must be github or local.') })()
          const handle = desktopPnpm.installWorkbenchGeneration({
            pluginSpec: target.pluginSpec,
            expectedPluginName: target.name,
            expectedVersion: target.version
          }, directory)
          await wait(handle)
          json(res, 200, { ok: true, name: target.name, version: target.version, source: target.source, restartRequired: true })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          webCtx.logger.warn(error instanceof Error ? error : new Error(message))
          json(res, 400, { ok: false, error: message })
        }
      }
    }), 'dsh-desktop-market-installer: developer plugin route'
  ))
}
