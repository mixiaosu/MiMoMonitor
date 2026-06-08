<p align="center">
  <img src="public/assets/logo.svg" width="80" alt="MiMo Monitor" />
</p>

<h1 align="center">MiMo Monitor</h1>

<p align="center">
  <strong>小米 MiMo AI 平台 · 桌面余额与用量监控工具</strong>
</p>

<p align="center">
  <a href="README_EN.md">English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/tauri-2.x-orange" alt="Tauri" />
  <img src="https://img.shields.io/badge/rust-1.77.2+-red" alt="Rust" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

---

## 简介

MiMo Monitor 是一款轻量级桌面工具，用于实时监控你在 [小米 MiMo 平台](https://platform.xiaomimimo.com) 的 API 余额和 Token 用量。

- **PAYG（现金余额）**：实时显示充值余额、赠送余额，支持 CNY 货币显示
- **Token Plan（积分订阅）**：显示套餐积分总量、已用量与剩余量，可视化进度条
- **用量明细**：自动同步月度 Token 用量，按类型（月度/套餐/补偿）分类展示
- **系统托盘常驻**：右击托盘图标随时查看余额，不占任务栏空间
- **一键登录同步**：内置 WebView 窗口自动登录 MiMo 平台，JS Hook 自动提取用量 Token

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | **Tauri 2.x**（Rust） |
| 前端 UI | **React 18** + TypeScript + Vite 5 |
| HTTP 客户端 | **reqwest**（Rust） |
| 图标库 | Lucide React |
| 打包 | Tauri Bundler（NSIS / DMG） |

## 功能

- [x] API Key 保存与验证（PAYG + Token Plan 双模式自动探测）
- [x] 余额查询（PAYG CNY / Token Plan 积分）
- [x] 用量 Token WebView 登录自动同步（Cookie + JS Hook 双重提取）
- [x] 手动粘贴用量 Token 兜底
- [x] 月度用量详情（按类型分项）
- [x] 自动刷新（1 分钟 / 5 分钟 / 30 分钟 / 1 小时可选）
- [x] 开机自启
- [x] 系统托盘（左键显隐面板，右键菜单）
- [x] 无边框透明窗口，skipTaskbar

## 安装

### Windows

从 [Releases](https://github.com/mixiaosu/MiMoMonitor/releases) 下载最新 `.exe` 安装包，双击安装即可。

### macOS

```bash
brew install --cask mimomonitor
```

或从 [Releases](https://github.com/mixiaosu/MiMoMonitor/releases) 下载 `.dmg` 文件。

## 开发

### 环境要求

- Rust 1.77.2+
- Node.js 18+
- npm

### 启动开发环境

```bash
git clone https://github.com/mixiaosu/MiMoMonitor.git
cd MiMoMonitor
npm install
npm run tauri:dev
```

## 配置

所有配置存储在 `%APPDATA%\MiMoMonitor\config.json`（Windows）或 `~/Library/Application Support/MiMoMonitor/config.json`（macOS）。

| 字段 | 说明 |
|------|------|
| `api_key` | MiMo API Key |
| `usage_token` | 用量查询 Token（`api-platform_serviceToken` cookie） |
| `account_type` | 账户类型：`payg` 或 `token_plan` |
| `refresh_interval_seconds` | 余额刷新间隔（60/300/1800/3600） |
| `auto_refresh_enabled` | 是否开启自动刷新 |
| `autostart` | 是否开机自启 |

## 许可证

[MIT](LICENSE)
