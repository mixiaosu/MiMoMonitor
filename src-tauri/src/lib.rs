#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use serde::{Deserialize, Serialize};
    use std::{
        fs,
        io::Read,
        os::windows::fs::OpenOptionsExt,
        path::{Path, PathBuf},
        process::Command,
        sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        },
        thread,
        time::Duration,
    };
    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
        webview::PageLoadEvent,
        Emitter, Manager, PhysicalPosition, Position, WebviewWindow,
    };

    // ── 配置数据结构 ──

    #[derive(Debug, Default, Deserialize, Serialize)]
    struct StoredConfig {
        api_key: Option<String>,
        #[serde(default)]
        usage_token: Option<String>,
        #[serde(default)]
        account_type: Option<String>, // "payg" | "token_plan"
        refresh_interval_seconds: u64,
        #[serde(default)]
        auto_refresh_enabled: bool,
        autostart: bool,
    }

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct AppConfig {
        api_key_configured: bool,
        api_key_preview: Option<String>,
        usage_token_configured: bool,
        account_type: Option<String>,
        refresh_interval_seconds: u64,
        auto_refresh_enabled: bool,
        autostart: bool,
        config_path: String,
    }

    fn config_path() -> Result<PathBuf, String> {
        let appdata = std::env::var_os("APPDATA").ok_or("APPDATA is not available")?;
        Ok(PathBuf::from(appdata)
            .join("MiMoMonitor")
            .join("config.json"))
    }

    fn read_stored_config() -> Result<StoredConfig, String> {
        let path = config_path()?;
        if !path.exists() {
            return Ok(StoredConfig {
                refresh_interval_seconds: 60,
                ..StoredConfig::default()
            });
        }
        let text = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        let mut config: StoredConfig =
            serde_json::from_str(&text).map_err(|error| error.to_string())?;
        config.refresh_interval_seconds =
            normalize_refresh_interval_seconds(config.refresh_interval_seconds);
        Ok(config)
    }

    fn normalize_refresh_interval_seconds(value: u64) -> u64 {
        match value {
            60 | 300 | 1800 | 3600 => value,
            _ => 60,
        }
    }

    fn write_stored_config(config: &StoredConfig) -> Result<(), String> {
        let path = config_path()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let text = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
        fs::write(path, text).map_err(|error| error.to_string())
    }

    fn api_key_preview(api_key: &str) -> String {
        let chars: Vec<char> = api_key.chars().collect();
        if chars.len() <= 12 {
            return "已保存".to_string();
        }
        let start: String = chars.iter().take(7).collect();
        let end: String = chars
            .iter()
            .rev()
            .take(4)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        format!("{start}...{end}")
    }

    fn to_app_config(config: StoredConfig) -> Result<AppConfig, String> {
        let path = config_path()?;
        let api_key_preview = config
            .api_key
            .as_ref()
            .filter(|value| !value.is_empty())
            .map(|value| api_key_preview(value));
        let usage_token_configured = config
            .usage_token
            .as_ref()
            .map(|value| !value.is_empty())
            .unwrap_or(false);
        Ok(AppConfig {
            api_key_configured: api_key_preview.is_some(),
            api_key_preview,
            usage_token_configured,
            account_type: config.account_type.clone(),
            refresh_interval_seconds: config.refresh_interval_seconds,
            auto_refresh_enabled: config.auto_refresh_enabled,
            autostart: config.autostart,
            config_path: path.to_string_lossy().to_string(),
        })
    }

    // ── 窗口管理 ──

    fn position_near_tray(window: &WebviewWindow) {
        let size = window.outer_size().unwrap_or(tauri::PhysicalSize::new(356, 600));
        let scale_factor = window.current_monitor().ok().flatten()
            .or_else(|| window.primary_monitor().ok().flatten())
            .map(|m| m.scale_factor())
            .unwrap_or(1.0);
        let margin = (12.0 * scale_factor).round() as i32;
        let width = size.width as i32;
        let height = size.height as i32;

        // Try to use cursor position, fall back to primary monitor
        let work_area = if let Ok(cursor) = window.cursor_position() {
            window.monitor_from_point(cursor.x, cursor.y)
                .ok().flatten()
                .or_else(|| window.primary_monitor().ok().flatten())
        } else {
            window.primary_monitor().ok().flatten()
        };

        if let Some(monitor) = work_area {
            let area = monitor.work_area();
            let right = area.position.x + area.size.width as i32;
            let bottom = area.position.y + area.size.height as i32;
            let x = right - width - margin;
            let y = bottom - height - margin;
            let _ = window.set_position(Position::Physical(PhysicalPosition::new(
                x.max(area.position.x),
                y.max(area.position.y),
            )));
        }
    }

    fn show_main_window(window: &WebviewWindow) {
        position_near_tray(window);
        if let Err(e) = window.show() {
            eprintln!("show failed: {e}");
        }
        if let Err(e) = window.set_focus() {
            eprintln!("set_focus failed: {e}");
        }
    }

    #[tauri::command]
    fn hide_main_window(window: WebviewWindow) -> Result<(), String> {
        window.hide().map_err(|error| error.to_string())
    }

    // ── 配置管理命令 ──

    #[tauri::command]
    fn get_app_config() -> Result<AppConfig, String> {
        to_app_config(read_stored_config()?)
    }

    #[tauri::command]
    fn save_api_key(api_key: String) -> Result<AppConfig, String> {
        let value = api_key.trim().to_string();
        if value.is_empty() {
            return Err("API Key 不能为空".to_string());
        }
        let mut config = read_stored_config()?;
        config.api_key = Some(value);
        write_stored_config(&config)?;
        to_app_config(config)
    }

    #[tauri::command]
    fn clear_api_key() -> Result<AppConfig, String> {
        let mut config = read_stored_config()?;
        config.api_key = None;
        write_stored_config(&config)?;
        to_app_config(config)
    }

    #[tauri::command]
    fn save_refresh_interval(refresh_interval_seconds: u64) -> Result<AppConfig, String> {
        let mut config = read_stored_config()?;
        config.refresh_interval_seconds =
            normalize_refresh_interval_seconds(refresh_interval_seconds);
        write_stored_config(&config)?;
        to_app_config(config)
    }

    #[tauri::command]
    fn save_auto_refresh_enabled(auto_refresh_enabled: bool) -> Result<AppConfig, String> {
        let mut config = read_stored_config()?;
        config.auto_refresh_enabled = auto_refresh_enabled;
        write_stored_config(&config)?;
        to_app_config(config)
    }

    fn apply_autostart(enabled: bool) -> Result<(), String> {
        let run_key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
        let value_name = "MiMoMonitor";
        if enabled {
            let exe = std::env::current_exe().map_err(|error| error.to_string())?;
            let exe_arg = exe.to_string_lossy().to_string();
            let status = Command::new("reg")
                .args(["add", run_key, "/v", value_name, "/t", "REG_SZ", "/d"])
                .arg(exe_arg)
                .args(["/f"])
                .status()
                .map_err(|error| format!("写入开机自启失败：{error}"))?;
            if !status.success() {
                return Err("写入开机自启失败".to_string());
            }
            return Ok(());
        }
        let status = Command::new("reg")
            .args(["delete", run_key, "/v", value_name, "/f"])
            .status()
            .map_err(|error| format!("关闭开机自启失败：{error}"))?;
        if !status.success() {
            return Ok(());
        }
        Ok(())
    }

    #[tauri::command]
    fn save_autostart(autostart: bool) -> Result<AppConfig, String> {
        apply_autostart(autostart)?;
        let mut config = read_stored_config()?;
        config.autostart = autostart;
        write_stored_config(&config)?;
        to_app_config(config)
    }

    // ── 余额查询 ──

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct BalanceResult {
        account_type: String,
        plan_name: Option<String>,
        // PAYG 字段
        total_balance: Option<String>,
        charge_balance: Option<String>,
        granted_balance: Option<String>,
        currency: Option<String>,
        // Token Plan 字段
        token_balance: Option<f64>,
        token_limit: Option<f64>,
        token_used: Option<f64>,
    }

    #[tauri::command]
    async fn fetch_balance() -> Result<BalanceResult, String> {
        let config = read_stored_config()?;
        let api_key = config
            .api_key
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "未配置 API Key".to_string())?;

        let client = reqwest::Client::new();

        // 先探测是 PAYG 还是 Token Plan
        let payg_url = "https://api.xiaomimimo.com/v1/user/balance";
        let tp_url = "https://token-plan-sgp.xiaomimimo.com/v1/user/balance";

        // 尝试 Token Plan 端点
        if let Ok(resp) = client
            .get(tp_url)
            .bearer_auth(&api_key)
            .timeout(Duration::from_secs(15))
            .send()
            .await
        {
            if resp.status().as_u16() == 200 {
                #[derive(Deserialize)]
                struct TpBalanceData {
                    token_balance: Option<f64>,
                    token_limit: Option<f64>,
                    plan_name: Option<String>,
                }
                #[derive(Deserialize)]
                struct TpBalanceResp {
                    data: Option<TpBalanceData>,
                }

                if let Ok(data) = resp.json::<TpBalanceResp>().await {
                    if let Some(d) = data.data {
                        let used = match (d.token_balance, d.token_limit) {
                            (Some(bal), Some(lim)) if lim > 0.0 => Some(lim - bal),
                            _ => None,
                        };
                        return Ok(BalanceResult {
                            account_type: "token_plan".to_string(),
                            plan_name: d.plan_name,
                            total_balance: None,
                            charge_balance: None,
                            granted_balance: None,
                            currency: None,
                            token_balance: d.token_balance,
                            token_limit: d.token_limit,
                            token_used: used,
                        });
                    }
                }
            }
        }

        // 尝试 PAYG 端点
        let resp = client
            .get(payg_url)
            .bearer_auth(&api_key)
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(|error| format!("网络请求失败：{error}"))?;

        match resp.status().as_u16() {
            200 => {}
            401 => return Err("API Key 无效或已过期".to_string()),
            429 => return Err("请求过于频繁，请稍后再试".to_string()),
            code if code >= 500 => return Err(format!("MiMo 服务器错误：{code}")),
            code => return Err(format!("请求失败：HTTP {code}")),
        }

        #[derive(Deserialize)]
        struct PaygBalanceData {
            balance: Option<String>,
            charge_balance: Option<String>,
            granted_balance: Option<String>,
            currency: Option<String>,
        }
        #[derive(Deserialize)]
        struct PaygBalanceResp {
            data: Option<PaygBalanceData>,
        }

        let data: PaygBalanceResp = resp
            .json()
            .await
            .map_err(|error| format!("解析余额数据失败：{error}"))?;

        if let Some(d) = data.data {
            Ok(BalanceResult {
                account_type: "payg".to_string(),
                plan_name: None,
                total_balance: d.balance,
                charge_balance: d.charge_balance,
                granted_balance: d.granted_balance,
                currency: d.currency.or(Some("CNY".to_string())),
                token_balance: None,
                token_limit: None,
                token_used: None,
            })
        } else {
            Err("余额数据为空".to_string())
        }
    }

    // ── 用量 Token 管理 ──

    #[tauri::command]
    fn save_usage_token(usage_token: String) -> Result<AppConfig, String> {
        let value = usage_token.trim().to_string();
        if value.is_empty() {
            return Err("用量 Token 不能为空".to_string());
        }
        let mut config = read_stored_config()?;
        config.usage_token = Some(value);
        write_stored_config(&config)?;
        to_app_config(config)
    }

    #[tauri::command]
    fn clear_usage_token() -> Result<AppConfig, String> {
        let mut config = read_stored_config()?;
        config.usage_token = None;
        write_stored_config(&config)?;
        to_app_config(config)
    }

    const USAGE_TOKEN_TITLE_PREFIX: &str = "MIMO_USAGE_TOKEN:";

    fn capture_usage_token(app: &tauri::AppHandle, token: String) -> Result<AppConfig, String> {
        let value = token.trim().to_string();
        if value.is_empty() {
            return Err("用量 Token 为空".to_string());
        }
        let mut config = read_stored_config()?;
        config.usage_token = Some(value);
        write_stored_config(&config)?;
        let app_config = to_app_config(config)?;

        if let Some(flag) = app.try_state::<Arc<AtomicBool>>() {
            flag.store(true, Ordering::SeqCst);
        }
        if let Some(window) = app.get_webview_window("login-sync") {
            let _ = window.close();
        }
        let _ = app.emit("usage-token-captured", &app_config);
        Ok(app_config)
    }

    async fn verify_usage_token(token: &str) -> Result<(), String> {
        let ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                  (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
        let url = "https://platform.xiaomimimo.com/api/v1/tokenPlan/usage";
        let resp = reqwest::Client::new()
            .get(url)
            .header("Cookie", format!("api-platform_serviceToken=\"{token}\""))
            .header("Accept", "application/json")
            .header("User-Agent", ua)
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(|error| format!("验证 token 失败：{error}"))?;
        if resp.status().as_u16() == 200 {
            Ok(())
        } else {
            Err(format!("token 无效：HTTP {}", resp.status().as_u16()))
        }
    }

    fn read_shared_text(path: &Path) -> Option<String> {
        let mut file = fs::OpenOptions::new()
            .read(true)
            .share_mode(0x1 | 0x2 | 0x4)
            .open(path)
            .ok()?;
        let metadata = file.metadata().ok()?;
        if metadata.len() == 0 || metadata.len() > 20 * 1024 * 1024 {
            return None;
        }
        let mut bytes = Vec::with_capacity(metadata.len() as usize);
        file.read_to_end(&mut bytes).ok()?;
        Some(String::from_utf8_lossy(&bytes).replace('\0', ""))
    }

    fn extract_mimo_cookie_token(text: &str) -> Option<String> {
        // 在 WebView2 缓存中搜索 api-platform_serviceToken cookie
        let marker = "api-platform_serviceToken";
        let mut search_from = 0;
        while let Some(relative_index) = text[search_from..].find(marker) {
            let pos = search_from + relative_index + marker.len();
            // 跳过 = 和可能的引号
            let rest = &text[pos..];
            let value_start = rest.find(|c: char| c != '=' && c != '"' && c != ' ' && c != '\\')?;
            let value = &rest[value_start..];
            // 取到下一个引号或分号或空白
            let value_end = value.find(|c: char| c == '"' || c == ';' || c == '\n' || c == '\r')
                .unwrap_or(value.len());
            let token = value[..value_end].trim().to_string();
            if token.len() > 20 {
                return Some(token);
            }
            search_from = pos + value_start + value_end;
        }
        None
    }

    fn find_webview_cached_usage_token() -> Option<String> {
        let local_app_data = std::env::var_os("LOCALAPPDATA")?;
        let cache_dir = PathBuf::from(local_app_data)
            .join("com.mimo.monitor")
            .join("EBWebView")
            .join("Default")
            .join("Cache")
            .join("Cache_Data");
        let entries = fs::read_dir(cache_dir).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            if let Some(text) = read_shared_text(&path) {
                if let Some(token) = extract_mimo_cookie_token(&text) {
                    return Some(token);
                }
            }
        }
        None
    }

    fn start_usage_title_watcher(app: tauri::AppHandle) {
        thread::spawn(move || {
            thread::sleep(Duration::from_secs(3));
            for _ in 0..1200 {
                if let Some(token) = find_webview_cached_usage_token() {
                    let _ = capture_usage_token(&app, token);
                    return;
                }
                let Some(window) = app.get_webview_window("login-sync") else {
                    let captured = app
                        .try_state::<Arc<AtomicBool>>()
                        .map(|flag| flag.load(Ordering::SeqCst))
                        .unwrap_or(false);
                    if !captured {
                        let _ = app.emit("usage-sync-ended", ());
                    }
                    return;
                };
                if let Ok(title) = window.title() {
                    if let Some(rest) = title.strip_prefix(USAGE_TOKEN_TITLE_PREFIX) {
                        let token = rest.to_string();
                        let verified = tauri::async_runtime::block_on(
                            verify_usage_token(&token),
                        );
                        if verified.is_ok() {
                            let _ = capture_usage_token(&app, token);
                            return;
                        }
                    }
                }
                thread::sleep(Duration::from_millis(1500));
            }
            let captured = app
                .try_state::<Arc<AtomicBool>>()
                .map(|flag| flag.load(Ordering::SeqCst))
                .unwrap_or(false);
            if !captured {
                let _ = app.emit("usage-sync-ended", ());
            }
        });
    }

    // JS hook：拦截 fetch/XHR 抓取 api-platform_serviceToken cookie
    const USAGE_SYNC_POLL_JS: &str = r#"
    (function() {
      if (window.__mimo_token_hook__) return;
      window.__mimo_token_hook__ = true;
      var done = false;
      var pending = false;

      function deliver(token) {
        if (done) return;
        if (!token || typeof token !== 'string') return;
        token = token.trim();
        if (token.length < 20) return;
        try { document.title = 'MIMO_USAGE_TOKEN:' + token; } catch (e) {}
        try {
          if (!pending && window.__TAURI__ && window.__TAURI__.core) {
            pending = true;
            window.__TAURI__.core.invoke('usage_token_captured', {
              token: token
            }).then(function() { done = true; }).catch(function() { pending = false; });
          }
        } catch (e) {}
      }

      function fromCookie(cookieStr) {
        if (!cookieStr) return;
        var m = /api-platform_serviceToken=([^;]+)/.exec(String(cookieStr));
        if (m && m[1]) {
          var token = m[1].replace(/^"|"$/g, '').trim();
          if (token.length > 20) deliver(token);
        }
      }

      var origFetch = window.fetch;
      if (typeof origFetch === 'function') {
        window.fetch = function(input, init) {
          try {
            var headers = (init && init.headers) || (input && input.headers);
            if (headers) {
              if (typeof Headers !== 'undefined' && headers instanceof Headers) {
                fromCookie(headers.get('cookie'));
              } else if (Array.isArray(headers)) {
                for (var i = 0; i < headers.length; i++) {
                  if (headers[i] && String(headers[i][0]).toLowerCase() === 'cookie') {
                    fromCookie(headers[i][1]);
                  }
                }
              } else if (typeof headers === 'object') {
                for (var k in headers) {
                  if (k.toLowerCase() === 'cookie') fromCookie(headers[k]);
                }
              }
            }
          } catch (e) {}
          return origFetch.apply(this, arguments);
        };
      }

      var origSet = XMLHttpRequest.prototype.setRequestHeader;
      XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        try {
          if (name && String(name).toLowerCase() === 'cookie') fromCookie(value);
        } catch (e) {}
        return origSet.apply(this, arguments);
      };
    })();
    "#;

    #[tauri::command]
    async fn start_usage_sync(app: tauri::AppHandle) -> Result<bool, String> {
        if let Some(flag) = app.try_state::<Arc<AtomicBool>>() {
            flag.store(false, Ordering::SeqCst);
        }

        // 先扫缓存
        if let Some(token) = find_webview_cached_usage_token() {
            capture_usage_token(&app, token)?;
            return Ok(true);
        }

        // 登录窗口已存在则刷新
        if app.get_webview_window("login-sync").is_some() {
            if let Some(window) = app.get_webview_window("login-sync") {
                let _ = window.eval("location.reload();");
            }
            return Ok(false);
        }

        let url = tauri::WebviewUrl::External(
            "https://platform.xiaomimimo.com".parse().unwrap(),
        );
        tauri::WebviewWindowBuilder::new(&app, "login-sync", url)
            .title("MiMo 账号登录")
            .inner_size(480.0, 720.0)
            .min_inner_size(360.0, 480.0)
            .resizable(true)
            .center()
            .visible(true)
            .initialization_script(USAGE_SYNC_POLL_JS)
            .on_page_load(|window, payload| {
                if matches!(payload.event(), PageLoadEvent::Finished)
                    && payload
                        .url()
                        .host_str()
                        .is_some_and(|host| host == "platform.xiaomimimo.com")
                {
                    let _ = window.eval(USAGE_SYNC_POLL_JS);
                }
            })
            .build()
            .map_err(|error| format!("打开登录窗口失败：{error}"))?;
        start_usage_title_watcher(app);
        Ok(false)
    }

    #[tauri::command]
    async fn usage_token_captured(
        app: tauri::AppHandle,
        token: String,
    ) -> Result<AppConfig, String> {
        let value = token.trim().to_string();
        if value.is_empty() {
            return Err("用量 Token 为空".to_string());
        }
        verify_usage_token(&value).await?;
        capture_usage_token(&app, value)
    }

    // ── 用量查询 ──

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct UsageItem {
        name: String,
        label: String,
        used: f64,
        limit: f64,
        remaining: f64,
        percent: f64,
    }

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct UsageResult {
        items: Vec<UsageItem>,
        total_used: f64,
        total_limit: f64,
    }

    #[tauri::command]
    async fn fetch_usage() -> Result<UsageResult, String> {
        let config = read_stored_config()?;
        let token = config
            .usage_token
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "未配置用量 Token".to_string())?;

        let ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                  (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
        let url = "https://platform.xiaomimimo.com/api/v1/tokenPlan/usage";

        let resp = reqwest::Client::new()
            .get(url)
            .header("Cookie", format!("api-platform_serviceToken=\"{token}\""))
            .header("Accept", "application/json")
            .header("User-Agent", ua)
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(|error| format!("用量请求失败：{error}"))?;

        match resp.status().as_u16() {
            200 => {}
            401 | 403 => return Err("用量 Token 无效或已过期，请重新获取".to_string()),
            429 => return Err("请求过于频繁，请稍后再试".to_string()),
            code => return Err(format!("用量接口错误：HTTP {code}")),
        }

        #[derive(Deserialize)]
        struct MonthUsageItem {
            name: String,
            used: f64,
            limit: f64,
            percent: f64,
        }
        #[derive(Deserialize)]
        struct MonthUsage {
            percent: Option<f64>,
            items: Vec<MonthUsageItem>,
        }
        #[derive(Deserialize)]
        struct UsageData {
            #[serde(rename = "monthUsage")]
            month_usage: MonthUsage,
        }
        #[derive(Deserialize)]
        struct UsageResp {
            data: UsageData,
        }

        let data: UsageResp = resp
            .json()
            .await
            .map_err(|error| format!("解析用量数据失败：{error}"))?;

        let label_map: std::collections::HashMap<&str, &str> = [
            ("month_total_token", "月度总 Token"),
            ("plan_total_token", "套餐积分"),
            ("compensation_total_token", "补偿积分"),
        ]
        .iter()
        .cloned()
        .collect();

        let mut items: Vec<UsageItem> = data
            .data
            .month_usage
            .items
            .into_iter()
            .map(|item| {
                let label = label_map
                    .get(item.name.as_str())
                    .unwrap_or(&item.name.as_str())
                    .to_string();
                UsageItem {
                    remaining: (item.limit - item.used).max(0.0),
                    name: item.name,
                    label,
                    used: item.used,
                    limit: item.limit,
                    percent: item.percent,
                }
            })
            .collect();

        let total_used: f64 = items.iter().map(|i| i.used).sum();
        let total_limit: f64 = items.iter().map(|i| i.limit).sum();

        // 按 used 降序排列
        items.sort_by(|a, b| b.used.partial_cmp(&a.used).unwrap_or(std::cmp::Ordering::Equal));

        Ok(UsageResult {
            items,
            total_used,
            total_limit,
        })
    }

    // ── 应用启动 ──

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                show_main_window(&window);
            }
        }))
        .manage(Arc::new(AtomicBool::new(false)))
        .invoke_handler(tauri::generate_handler![
            hide_main_window,
            get_app_config,
            save_api_key,
            clear_api_key,
            save_refresh_interval,
            save_auto_refresh_enabled,
            save_autostart,
            fetch_balance,
            save_usage_token,
            clear_usage_token,
            fetch_usage,
            start_usage_sync,
            usage_token_captured
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let show_item =
                MenuItem::with_id(app, "show", "显示主面板", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            show_main_window(&window);
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                show_main_window(&window);
                            }
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            tray_builder.build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
