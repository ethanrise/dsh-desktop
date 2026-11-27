# DSH Desktop — 非官方 Linux 版本

[English](README.md) | 简体中文

[dataelement/dsh-desktop](https://github.com/dataelement/dsh-desktop)
官方只提供 Windows 和 macOS 安装包，本仓库提供社区维护的 Linux amd64
`.deb` 安装包。

本仓库**不包含应用源码**。GitHub Actions 每 3 小时检查一次上游，发现新的
release tag（`vX.Y.Z`）就基于上游源码进行 Linux 集成和打包，并在这里发布为
`linux-vX.Y.Z-rN`，其中 `N` 是 Debian 打包修订号。

## 安装

从 [Releases](../../releases) 下载最新的 `.deb`，然后执行：

```bash
sudo apt install ./dsh-desktop-<版本号>-linux-amd64.deb
```

用每个 release 附带的 `SHA256SUMS` 校验下载文件：

```bash
sha256sum -c SHA256SUMS
```

### 可选插件 · Linux 桌面与浏览器控制

从 `linux-v0.14.1-r1` 起，Linux amd64 `.deb` 安装包内置 [dsh-cua-linux](https://github.com/ethanrise/dsh-cua-linux)。全新安装时，电脑操控默认关闭。在 **设置 → 内置插件 → 电脑操控** 点击 **启用电脑操控**，即可从本地安装。已安装过的用户可以在这里管理现有插件。桌面操控支持 X11，以及 XWayland 下的 X11 应用。

## 说明

- Linux 构建包含打包元数据和电脑操控的 Desktop 集成。旧版安装包可以单独安装插件。
- 预发布 tag（如 `v0.10.0-beta`）会发布为 GitHub prerelease。
- 应用本身的 bug 请反馈给上游；打包相关的问题请在本仓库提 issue。
- 本项目不是 DataElement 官方发布。

## 手动构建

Actions → **Build unofficial Linux DEB** → Run workflow。可以指定上游 tag，
同一上游 tag 再发布时，填写更高的修订号。例如 `linux-v0.14.1-r2`
对应 Debian 版本 `0.14.1-2`。每个修订都有独立的安装包和校验文件。
