# DSH Desktop — Unofficial Linux builds

English | [简体中文](README.zh-CN.md)

Community-maintained Linux amd64 `.deb` packages of
[dataelement/dsh-desktop](https://github.com/dataelement/dsh-desktop),
which only ships official Windows and macOS installers.

This repository contains **no application source**. A GitHub Actions
workflow checks upstream every 3 hours, builds each new release tag
(`vX.Y.Z`) with Linux packaging and integration changes, and publishes it
here as `linux-vX.Y.Z-rN`, where `N` is the Debian package revision.

## Install

Download the latest `.deb` from [Releases](../../releases), then:

```bash
sudo apt install ./dsh-desktop-<version>-linux-amd64.deb
```

Verify the download with the `SHA256SUMS` file attached to each release:

```bash
sha256sum -c SHA256SUMS
```

### Optional plugin — Linux desktop and browser control

Starting with `linux-v0.14.1-r1`, Linux amd64 `.deb` packages bundle [dsh-cua-linux](https://github.com/ethanrise/dsh-cua-linux). Computer use is disabled by default on fresh installations. In **Settings → Built-in plugins → Computer use**, select **Enable computer use** to install it from the local package. If you already installed the plugin, the same tab manages its existing installation. Desktop control supports X11 and X11 applications under XWayland.

## Notes

- Linux builds include packaging metadata and the Desktop integration for bundled computer use.
- Older packages without the bundle can install the plugin separately.
- Prerelease tags (e.g. `v0.10.0-beta`) are published as GitHub prereleases.
- Report application bugs upstream; report packaging issues here.
- This is not an official DataElement release.

## Build manually

Actions → **Build unofficial Linux DEB** → Run workflow, optionally with a
specific upstream tag. For another build of the same tag, set a higher
revision. For example, `linux-v0.14.1-r2` installs as `0.14.1-2`. Each
revision has its own package and checksum.
