<p align="center">
  <img src="public/assets/logo.svg" width="80" alt="MiMo Monitor" />
</p>

<h1 align="center">MiMo Monitor</h1>

<p align="center">
  <strong>Desktop Balance & Usage Monitor for Xiaomi MiMo AI Platform</strong>
</p>

<p align="center">
  <a href="README.md">中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/tauri-2.x-orange" alt="Tauri" />
  <img src="https://img.shields.io/badge/rust-1.77.2+-red" alt="Rust" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

---

## Overview

MiMo Monitor is a lightweight desktop tool for real-time monitoring of your API balance and Token usage on the [Xiaomi MiMo platform](https://platform.xiaomimimo.com).

- **PAYG (Pay-As-You-Go)**: Real-time display of charged and granted balance in CNY
- **Token Plan**: View your credit package totals, used, and remaining with visual progress bars
- **Usage Details**: Automatically sync monthly Token usage, categorized by type
- **System Tray**: Check balance anytime via right-click, no taskbar clutter
- **One-Click Sync**: Built-in WebView login with JS Hook auto-extraction of usage tokens

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop Framework | **Tauri 2.x** (Rust) |
| Frontend UI | **React 18** + TypeScript + Vite 5 |
| HTTP Client | **reqwest** (Rust) |
| Icons | Lucide React |
| Bundler | Tauri Bundler (NSIS / DMG) |

## Features

- [x] API Key save & validation (auto-detect PAYG vs Token Plan)
- [x] Balance query (PAYG CNY / Token Plan credits)
- [x] Usage token WebView login sync (Cookie + JS Hook dual extraction)
- [x] Manual usage token paste fallback
- [x] Monthly usage breakdown by type
- [x] Auto-refresh (1min / 5min / 30min / 1hr)
- [x] Launch on startup
- [x] System tray (left-click toggle, right-click menu)
- [x] Frameless transparent window, skipTaskbar

## Installation

### Windows

Download the latest `.exe` installer from [Releases](https://github.com/mixiaosu/MiMoMonitor/releases) and double-click to install.

### macOS

```bash
brew install --cask mimomonitor
```

Or download the `.dmg` from [Releases](https://github.com/mixiaosu/MiMoMonitor/releases).

## Development

### Prerequisites

- Rust 1.77.2+
- Node.js 18+
- npm

### Getting Started

```bash
git clone https://github.com/mixiaosu/MiMoMonitor.git
cd MiMoMonitor
npm install
npm run tauri:dev
```

## Configuration

All configuration is stored in `%APPDATA%\MiMoMonitor\config.json` (Windows) or `~/Library/Application Support/MiMoMonitor/config.json` (macOS).

| Field | Description |
|-------|-------------|
| `api_key` | MiMo API Key |
| `usage_token` | Usage query token (`api-platform_serviceToken` cookie) |
| `account_type` | Account type: `payg` or `token_plan` |
| `refresh_interval_seconds` | Balance refresh interval (60/300/1800/3600) |
| `auto_refresh_enabled` | Enable auto refresh |
| `autostart` | Launch on startup |

## License

[MIT](LICENSE)
