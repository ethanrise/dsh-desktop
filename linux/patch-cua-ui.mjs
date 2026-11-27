// Apply the Linux-only settings integration to the upstream build checkout.
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const project = resolve(process.argv[2] ?? '.')
const payload = resolve(process.argv[3])
const version = /^dsh-cua-linux-(\d+\.\d+\.\d+)\.tgz$/.exec(payload.split('/').at(-1))?.[1]
if (!version) throw new Error('Expected a versioned dsh-cua-linux tarball')
const filename = JSON.stringify(`dsh-cua-linux-${version}.tgz`)
const channel = "'desktop-linux-cua:bundle'"

function patch(file, anchor, replacement) {
  const path = join(project, file)
  const source = readFileSync(path, 'utf8')
  if (source.split(anchor).length !== 2) throw new Error(`Upstream integration point changed: ${file}: ${anchor}`)
  writeFileSync(path, source.replace(anchor, () => replacement))
}

const restart = '  ipcMain.handle(DESKTOP_IPC.restartHarness, async event => {'
patch('src/main/shell/app.ts', restart, `  ipcMain.handle(${channel}, event => {
    assertMain(event)
    if (process.platform !== 'linux' || !app.isPackaged || safeMode) return null
    const path = join(process.resourcesPath, 'linux-plugins', ${filename})
    if (!existsSync(path)) return null
    const wayland = process.env.XDG_SESSION_TYPE === 'wayland' || Boolean(process.env.WAYLAND_DISPLAY)
    const support = !process.env.DISPLAY ? 'unavailable' : wayland ? 'xwayland' : 'x11'
    return { path, version: ${JSON.stringify(version)}, support }
  })
${restart}`)

const preload = 'src/preload/app.ts'
const bridgeType = "  restartHarness?: () => Promise<{ ok: boolean }>"
const bundleType = "{ path: string; version: string; support: 'x11' | 'xwayland' | 'unavailable' } | null"
patch(preload, bridgeType, `${bridgeType}
  getLinuxComputerUseBundle?: () => Promise<${bundleType}>`)
const bridge = '  desktopBridge.restartHarness = () => ipcRenderer.invoke(DESKTOP_IPC.restartHarness) as Promise<{ ok: boolean }>'
patch(preload, bridge, `${bridge}
  desktopBridge.getLinuxComputerUseBundle = () => ipcRenderer.invoke(${channel}) as Promise<${bundleType}>`)

const client = 'packages/dsh-desktop-market-installer/client.js'
const component = readFileSync(new URL('./cua-settings.js', import.meta.url), 'utf8').trimEnd()
const apply = '    function apply(ctx) {'
patch(client, apply, `${component}

${apply}
      registerComputerUseSettings(ctx)`)
