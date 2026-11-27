    function registerComputerUseSettings(ctx) {
      const desktop = globalThis.dshDesktop
      if (typeof desktop?.getLinuxComputerUseBundle !== 'function') return
      const ns = 'settings.desktopComputerUse'
      const title = 'computerUse'
      ctx.effect(() => ctx.locale.register(ns, {
        en: {
          computerUse: 'Computer use', enable: 'Enable computer use', disable: 'Disable computer use',
          x11: 'X11 desktop session detected.',
          xwayland: 'XWayland supports X11 applications. Native Wayland applications are outside its control.',
          unavailable: 'No X11 display detected. An X11 or XWayland session is required for desktop control.',
          failed: 'Could not update computer use.', statusFailed: 'Could not read computer use status.',
          restart: 'Restart Harness to apply', enabled: 'Enabled', disabled: 'Disabled',
          working: 'Applying…'
        },
        zh: {
          computerUse: '电脑操控', enable: '启用电脑操控', disable: '停用电脑操控',
          x11: '当前为 X11 桌面会话。',
          xwayland: '当前为 XWayland 环境，只能操控 X11 应用。',
          unavailable: '当前未检测到 X11 显示。桌面操控需要 X11 或 XWayland。',
          failed: '无法更改电脑操控设置。', statusFailed: '无法读取电脑操控状态。',
          restart: '重启 Harness 使更改生效', enabled: '已启用', disabled: '已停用',
          working: '正在应用…'
        }
      }), 'desktop computer use: copy dictionaries')
      const t = ctx.locale.bind(ns)
      const manager = ctx.remote.pluginManager
      const name = 'dsh-cua-linux'
      const message = failure => failure?.diagnostic || failure?.message || failure?.code || String(failure)
      const unwrap = result => {
        if (!result?.ok) throw new Error(message(result?.error || t('failed')))
        return result.value
      }
      let live = true
      let disposeSlot
      ctx.effect(() => {
        void desktop.getLinuxComputerUseBundle().then(bundle => {
          if (!bundle || !live) return
          disposeSlot = ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register(
            { name: 'settings.plugins.tab', id: 'desktop-linux-computer-use', order: 21, label: () => t(title), locale: ns },
            ComputerUse
          ))
          function ComputerUse() {
            const [installed, setInstalled] = React.useState(undefined)
            const [ready, setReady] = React.useState(false)
            const [busy, setBusy] = React.useState(false)
            const [pending, setPending] = React.useState(false)
            const [error, setError] = React.useState('')
            const running = React.useRef(false)

            async function inventory() {
              const bundles = unwrap(await manager.listBundles())
              if (!Array.isArray(bundles)) throw new Error(t('statusFailed'))
              return bundles.find(item => item?.name === name)
            }

            React.useEffect(() => {
              let active = true
              let revision = 0
              const refresh = async () => {
                const current = ++revision
                try {
                  const item = await inventory()
                  if (active && current === revision) {
                    setInstalled(item)
                    setReady(true)
                    setError('')
                  }
                } catch (failure) {
                  if (active && current === revision) {
                    setReady(false)
                    setError(message(failure))
                  }
                }
              }
              const offChanged = ctx.remote.$on('plugin-manager/changed', refresh)
              const offReset = ctx.on('connection/reset', refresh)
              void refresh()
              return () => { active = false; offChanged(); offReset() }
            }, [])

            async function change(restart, enable) {
              if (running.current) return
              running.current = true
              setBusy(true)
              setError('')
              try {
                if (restart) {
                  if (!(await desktop.restartHarness())?.ok) throw new Error(t('failed'))
                  setPending(false)
                } else {
                  const item = await inventory()
                  const result = unwrap(item
                    ? await manager.setBundleEnabled(name, enable)
                    : await manager.installBundle(bundle.path, {
                      expectedName: name, expectedVersion: bundle.version, enabled: true
                    }))
                  if (!['applied', 'restart-required'].includes(result?.application)) {
                    throw new Error(message(result?.error || t('failed')))
                  }
                  setPending(result.restartRequired === true || result.application === 'restart-required')
                  setInstalled(await inventory())
                }
              } catch (failure) {
                setError(message(failure))
              } finally {
                running.current = false
                setBusy(false)
              }
            }

            const enabled = installed?.enabled === true
            return React.createElement('div', { className: 'dshDesktopBuiltInImage' },
              React.createElement('div', { className: 'dshDesktopBuiltInImageTitle' }, t(title)),
              React.createElement('p', { className: 'dshDesktopBuiltInImageHint' }, t(bundle.support)),
              ready && React.createElement('p', { role: 'status' },
                busy ? t('working') : `${t(enabled ? 'enabled' : 'disabled')} · ${installed?.version ?? bundle.version}`),
              error && React.createElement('p', { role: 'alert', className: 'dshDesktopMarketError' }, error),
              React.createElement('button', {
                type: 'button', disabled: busy || (!pending && (!ready || (!enabled && bundle.support === 'unavailable'))),
                className: 'dshDesktopMarketButton dshDesktopMarketPrimary',
                onClick: () => void change(pending, !enabled)
              }, t(pending ? 'restart' : enabled ? 'disable' : 'enable'))
            )
          }
        }).catch(failure => console.error('desktop computer use: bundle discovery failed', failure))
        return () => {
          live = false
          if (typeof disposeSlot === 'function') disposeSlot()
        }
      }, 'desktop computer use: settings slot')
    }
