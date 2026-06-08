import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import {
  BarChart3,
  CheckCircle2,
  CreditCard,
  Info,
  KeyRound,
  Power,
  RefreshCw,
  Settings,
  Shirt,
  SunMedium,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import "./styles.css";

type ViewName = "dashboard" | "settings" | "detail";

type AppConfig = {
  apiKeyConfigured: boolean;
  apiKeyPreview: string | null;
  usageTokenConfigured: boolean;
  accountType: string | null;
  refreshIntervalSeconds: number;
  autoRefreshEnabled: boolean;
  autostart: boolean;
  configPath: string;
};

type BalanceResult = {
  accountType: string;
  planName?: string;
  totalBalance?: string;
  chargeBalance?: string;
  grantedBalance?: string;
  currency?: string;
  tokenBalance?: number;
  tokenLimit?: number;
  tokenUsed?: number;
};

type UsageItem = {
  name: string;
  label: string;
  used: number;
  limit: number;
  remaining: number;
  percent: number;
};

type UsageResult = {
  items: UsageItem[];
  totalUsed: number;
  totalLimit: number;
};

type BalanceState = "loading" | "ok" | "error" | "nokey";

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

const fmtTokensShort = (n: number) => {
  if (n >= 1e8) return (n / 1e6).toFixed(0) + "M";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
};

const refreshOptions = [
  { label: "1 分钟", value: 60 },
  { label: "5 分钟", value: 300 },
  { label: "30 分钟", value: 1800 },
  { label: "1 小时", value: 3600 },
];

function App() {
  const [view, setView] = React.useState<ViewName>("dashboard");
  const [balance, setBalance] = React.useState<BalanceResult | null>(null);
  const [balanceState, setBalanceState] = React.useState<BalanceState>("loading");
  const [balanceError, setBalanceError] = React.useState("");

  const [usage, setUsage] = React.useState<UsageResult | null>(null);
  const [usageState, setUsageState] = React.useState<BalanceState>("loading");
  const [usageError, setUsageError] = React.useState("");
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = React.useState(60);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = React.useState(false);

  const loadBalance = React.useCallback(() => {
    setBalanceState("loading");
    void invoke<BalanceResult>("fetch_balance")
      .then((data) => {
        setBalance(data);
        setBalanceState("ok");
      })
      .catch((error) => {
        const message = typeof error === "string" ? error : "查询失败";
        setBalanceError(message);
        setBalanceState(message.includes("未配置") ? "nokey" : "error");
      });
  }, []);

  const loadUsage = React.useCallback(() => {
    setUsageState("loading");
    void invoke<UsageResult>("fetch_usage")
      .then((data) => {
        setUsage(data);
        setUsageState("ok");
        setUsageError("");
      })
      .catch((error) => {
        const message = typeof error === "string" ? error : "查询失败";
        setUsageError(message);
        setUsage(null);
        setUsageState(message.includes("未配置") ? "nokey" : "error");
      });
  }, []);

  const refreshAll = React.useCallback(() => {
    loadBalance();
    loadUsage();
  }, [loadBalance, loadUsage]);

  React.useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  React.useEffect(() => {
    void invoke<AppConfig>("get_app_config")
      .then((config) => {
        setRefreshIntervalSeconds(config.refreshIntervalSeconds || 60);
        setAutoRefreshEnabled(config.autoRefreshEnabled);
      })
      .catch(() => {
        setRefreshIntervalSeconds(60);
        setAutoRefreshEnabled(false);
      });
  }, []);

  React.useEffect(() => {
    if (!autoRefreshEnabled) return;
    const timer = window.setInterval(refreshAll, refreshIntervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled, refreshAll, refreshIntervalSeconds]);

  const hideWindow = React.useCallback(() => {
    void invoke("hide_main_window").catch(() => {});
  }, []);

  return (
    <div className="stage">
      {view === "dashboard" && (
        <DashboardPanel
          balance={balance}
          balanceState={balanceState}
          balanceError={balanceError}
          usage={usage}
          usageState={usageState}
          usageError={usageError}
          onRefresh={refreshAll}
          onClose={hideWindow}
          onSettings={() => setView("settings")}
          onDetail={() => setView("detail")}
        />
      )}
      {view === "settings" && (
        <SettingsPanel
          onUsageLoaded={(nextUsage) => {
            setUsage(nextUsage);
            setUsageState("ok");
            setUsageError("");
          }}
          onUsageCleared={() => {
            setUsage(null);
            setUsageState("nokey");
            setUsageError("未配置用量 Token");
          }}
          onRefreshIntervalChanged={setRefreshIntervalSeconds}
          onAutoRefreshChanged={setAutoRefreshEnabled}
          onBack={() => setView("dashboard")}
        />
      )}
      {view === "detail" && (
        <DetailPanel usage={usage} usageState={usageState} onBack={() => setView("dashboard")} />
      )}
    </div>
  );
}

function BrandIcon({ size = 32 }: { size?: number }) {
  return (
    <div className="brand-icon" style={{ width: size, height: size }}>
      <img src="/assets/logo.svg" alt="MiMo" />
    </div>
  );
}

function DashboardPanel({
  balance,
  balanceState,
  balanceError,
  usage,
  usageState,
  usageError,
  onRefresh,
  onClose,
  onSettings,
  onDetail,
}: {
  balance: BalanceResult | null;
  balanceState: BalanceState;
  balanceError: string;
  usage: UsageResult | null;
  usageState: BalanceState;
  usageError: string;
  onRefresh: () => void;
  onClose: () => void;
  onSettings: () => void;
  onDetail: () => void;
}) {
  const [theme, setTheme] = React.useState<string>(
    () => localStorage.getItem("ui-theme") || "dark",
  );
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("ui-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  const topItems = usage?.items?.slice(0, 2) ?? [];
  const restItems = usage?.items?.slice(2) ?? [];
  const maxUsed = Math.max(...topItems.map((it) => it.used), 1);

  return (
    <section className="panel dashboard-panel" data-testid="dashboard-panel">
      <header className="panel-header" data-tauri-drag-region>
        <div className="title-lockup" data-tauri-drag-region>
          <BrandIcon size={36} />
          <h1>MiMo Monitor</h1>
        </div>
        <div className="header-actions">
          <button aria-label="刷新" onClick={onRefresh}>
            <RefreshCw size={22} />
          </button>
          <div className="skin-menu-wrap">
            <button
              aria-label="Toggle theme"
              className="skin-toggle"
              title={theme === "dark" ? "Switch to light" : "Switch to dark"}
              onClick={toggleTheme}
            >
              <Shirt size={21} />
            </button>
          </div>
          <button aria-label="设置" onClick={onSettings}>
            <Settings size={23} />
          </button>
          <button aria-label="关闭" onClick={onClose}>
            <X size={25} />
          </button>
        </div>
      </header>

      <BalanceCard balance={balance} state={balanceState} error={balanceError} />

      <div className="usage-stack">
        {usageState === "ok" && topItems.length > 0 ? (
          topItems.map((item) => (
            <UsageRow
              key={item.name}
              item={item}
              maxUsed={maxUsed}
              state={usageState}
              onClick={onDetail}
            />
          ))
        ) : (
          <>
            <UsageRowPlaceholder state={usageState} />
            <UsageRowPlaceholder state={usageState} />
          </>
        )}
      </div>

      <UsageOverviewBar items={restItems} state={usageState} error={usageError} />
    </section>
  );
}

function BalanceCard({
  balance,
  state,
  error,
}: {
  balance: BalanceResult | null;
  state: BalanceState;
  error: string;
}) {
  const isTokenPlan = balance?.accountType === "token_plan";
  const isPayg = balance?.accountType === "payg";

  const amount =
    state === "loading"
      ? "查询中…"
      : state === "nokey"
        ? "未配置"
        : state === "error"
          ? "查询失败"
          : isTokenPlan
            ? balance?.tokenBalance != null && balance?.tokenLimit != null
              ? `${fmtTokensShort(balance.tokenBalance)} / ${fmtTokensShort(balance.tokenLimit)}`
              : "—"
            : isPayg
              ? `${balance?.currency === "USD" ? "$" : "¥"}${balance?.totalBalance ?? "0.00"}`
              : "—";

  const statusText =
    state === "ok"
      ? isTokenPlan
        ? "Token Plan"
        : isPayg
          ? "PAYG"
          : "—"
      : "—";

  const labelText = isTokenPlan
    ? balance?.planName ?? "Token Plan"
    : "账户余额";

  const icon = isTokenPlan ? <Zap size={15} /> : <Wallet size={15} />;

  return (
    <article className="card balance-card">
      <div className="card-title-row">
        <div className="caption-with-icon">
          {icon}
          <span>{labelText}</span>
        </div>
        <div className="status-pill">
          <span />
          {statusText}
        </div>
      </div>
      <div className={`balance-amount ${state !== "ok" ? "balance-dim" : ""}`}>{amount}</div>
      {state === "error" && <div className="balance-error">{error}</div>}
      <div className="metric-grid">
        {isTokenPlan ? (
          <>
            <div className="mini-card">
              <div className="caption-with-icon orange">
                <SunMedium size={15} />
                <span>已用 Token</span>
              </div>
              <strong>
                {balance?.tokenUsed != null ? fmtTokensShort(balance.tokenUsed) : "—"}
              </strong>
            </div>
            <div className="mini-card">
              <div className="caption-with-icon orange">
                <Wallet size={15} />
                <span>剩余 Token</span>
              </div>
              <strong>
                {balance?.tokenBalance != null ? fmtTokensShort(balance.tokenBalance) : "—"}
              </strong>
            </div>
          </>
        ) : (
          <>
            <div className="mini-card">
              <div className="caption-with-icon orange">
                <CreditCard size={15} />
                <span>充值余额</span>
              </div>
              <strong>
                {isPayg && balance?.chargeBalance != null
                  ? `${balance?.currency === "USD" ? "$" : "¥"}${balance.chargeBalance}`
                  : "—"}
              </strong>
            </div>
            <div className="mini-card">
              <div className="caption-with-icon orange">
                <SunMedium size={15} />
                <span>赠送余额</span>
              </div>
              <strong>
                {isPayg && balance?.grantedBalance != null
                  ? `${balance?.currency === "USD" ? "$" : "¥"}${balance.grantedBalance}`
                  : "—"}
              </strong>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function UsageRow({
  item,
  maxUsed,
  state,
  onClick,
}: {
  item: UsageItem;
  maxUsed: number;
  state: BalanceState;
  onClick: () => void;
}) {
  const tokensText =
    state === "loading"
      ? "查询中…"
      : `${fmtInt(item.used)} / ${fmtInt(item.limit)}`;
  const percentText = `${item.percent.toFixed(1)}%`;
  const width = maxUsed > 0 ? `${Math.max(2, (item.used / maxUsed) * 100)}%` : "0%";

  return (
    <button className="card usage-row" onClick={onClick}>
      <div className="model-badge flash">
        <Zap size={27} fill="currentColor" />
      </div>
      <div className="usage-main">
        <h2>{item.label}</h2>
        <div className="token-line">
          <span>{tokensText}</span>
          <div className="progress-track">
            <i className="brand-fill" style={{ width }} />
          </div>
        </div>
      </div>
      <div className="usage-price">
        <strong>{percentText}</strong>
        <span>已用</span>
      </div>
    </button>
  );
}

function UsageRowPlaceholder({ state }: { state: BalanceState }) {
  const placeholder =
    state === "loading"
      ? "查询中…"
      : state === "nokey"
        ? "未配置 Token"
        : state === "error"
          ? "用量不可用"
          : "暂无数据";
  return (
    <div className="card usage-row usage-row-no-click">
      <div className="model-badge flash">
        <Zap size={27} />
      </div>
      <div className="usage-main">
        <h2>{placeholder}</h2>
        <div className="token-line">
          <span>—</span>
          <div className="progress-track">
            <i className="brand-fill" style={{ width: "0%" }} />
          </div>
        </div>
      </div>
      <div className="usage-price">
        <strong>—</strong>
      </div>
    </div>
  );
}

function UsageOverviewBar({
  items,
  state,
  error,
}: {
  items: UsageItem[];
  state: BalanceState;
  error: string;
}) {
  const maxUsed = Math.max(...items.map((it) => it.used), 1);
  const placeholder =
    state === "loading"
      ? "查询中…"
      : state === "nokey"
        ? "未配置用量 Token"
        : state === "error"
          ? error
          : "暂无数据";

  return (
    <article className="card chart-card">
      <div className="card-title-row">
        <div className="caption-with-icon">
          <BarChart3 size={16} className="brand-blue" />
          <span>用量明细</span>
        </div>
        <span className="chart-total">
          {state === "ok" ? `${items.length} 项` : "—"}
        </span>
      </div>
      {state === "ok" && items.length > 0 ? (
        <div className="overview-bars">
          {items.map((item) => {
            const width = maxUsed > 0 ? `${Math.max(2, (item.used / maxUsed) * 100)}%` : "0%";
            return (
              <div className="overview-bar-row" key={item.name}>
                <span className="bar-label">{item.label}</span>
                <div className="progress-track">
                  <i className="brand-fill" style={{ width }} />
                </div>
                <span className="bar-percent">{item.percent.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="chart-placeholder">{placeholder}</div>
      )}
    </article>
  );
}

function SettingsPanel({
  onBack,
  onUsageLoaded,
  onUsageCleared,
  onRefreshIntervalChanged,
  onAutoRefreshChanged,
}: {
  onBack: () => void;
  onUsageLoaded: (usage: UsageResult) => void;
  onUsageCleared: () => void;
  onRefreshIntervalChanged: (seconds: number) => void;
  onAutoRefreshChanged: (enabled: boolean) => void;
}) {
  const [apiKey, setApiKey] = React.useState("");
  const [config, setConfig] = React.useState<AppConfig | null>(null);
  const [status, setStatus] = React.useState("正在读取本地配置");
  const [busy, setBusy] = React.useState(false);
  const [refresh, setRefresh] = React.useState(60);
  const [autoRefresh, setAutoRefresh] = React.useState(false);
  const [autostart, setAutostart] = React.useState(false);
  const [usageToken, setUsageToken] = React.useState("");
  const [usageStatus, setUsageStatus] = React.useState("");
  const [usageSyncing, setUsageSyncing] = React.useState(false);
  const [showManualPaste, setShowManualPaste] = React.useState(false);
  const [appVersion, setAppVersion] = React.useState("1.0.0");
  const configPath = config?.configPath ?? "%APPDATA%\\MiMoMonitor\\config.json";

  React.useEffect(() => {
    void invoke<AppConfig>("get_app_config")
      .then((nextConfig) => {
        setConfig(nextConfig);
        setRefresh(nextConfig.refreshIntervalSeconds || 60);
        setAutoRefresh(nextConfig.autoRefreshEnabled);
        setAutostart(nextConfig.autostart);
        setStatus(nextConfig.apiKeyConfigured ? `已配置 ${nextConfig.apiKeyPreview}` : "未配置 API Key");
        setUsageStatus(nextConfig.usageTokenConfigured ? "用量 Token 已配置" : "未配置用量 Token");
      })
      .catch(() => {
        setStatus("浏览器预览模式，未连接本地配置");
      });
  }, []);

  React.useEffect(() => {
    void getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion("1.0.0"));
  }, []);

  const refreshUsageAfterToken = React.useCallback(
    (prefix: string) => {
      setUsageStatus(`${prefix}，正在刷新用量数据…`);
      return invoke<UsageResult>("fetch_usage")
        .then((nextUsage) => {
          onUsageLoaded(nextUsage);
          const totalText = fmtTokensShort(nextUsage.totalUsed);
          setUsageStatus(`${prefix}，用量 ${totalText} tokens`);
          return nextUsage;
        })
        .catch((error) => {
          const message = typeof error === "string" ? error : "用量刷新失败";
          setUsageStatus(`${prefix}，但用量刷新失败：${message}`);
          throw error;
        });
    },
    [onUsageLoaded],
  );

  React.useEffect(() => {
    const unlistenPromise = listen<AppConfig>("usage-token-captured", (event) => {
      setConfig(event.payload);
      setUsageSyncing(false);
      void refreshUsageAfterToken("已通过网页登录自动同步用量 Token");
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [refreshUsageAfterToken]);

  React.useEffect(() => {
    const unlistenPromise = listen("usage-sync-ended", () => {
      setUsageSyncing(false);
      setUsageStatus("登录窗口已关闭，Token 未获取到。可重新点击同步或使用方式二手动粘贴。");
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const pasteApiKey = React.useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setApiKey(text.trim());
      setStatus("已从剪贴板读取");
    } catch {
      setStatus("剪贴板读取失败");
    }
  }, []);

  const saveApiKey = React.useCallback(() => {
    setBusy(true);
    void invoke<AppConfig>("save_api_key", { apiKey })
      .then((nextConfig) => {
        setConfig(nextConfig);
        setApiKey("");
        setStatus("已保存，正在验证 Key…");
        return invoke<BalanceResult>("fetch_balance");
      })
      .then((balance) => {
        const symbol = balance?.currency === "USD" ? "$" : "¥";
        const isPayg = balance?.accountType === "payg";
        const isTokenPlan = balance?.accountType === "token_plan";
        if (isPayg) {
          setStatus(`验证通过，当前余额 ${symbol}${balance.totalBalance ?? "0.00"}`);
        } else if (isTokenPlan) {
          setStatus(`验证通过，Token Plan: ${balance.planName ?? "—"}`);
        } else {
          setStatus("验证通过");
        }
      })
      .catch((error) => {
        setStatus(typeof error === "string" ? error : "保存或验证失败");
      })
      .finally(() => setBusy(false));
  }, [apiKey]);

  const clearApiKey = React.useCallback(() => {
    setBusy(true);
    void invoke<AppConfig>("clear_api_key")
      .then((nextConfig) => {
        setConfig(nextConfig);
        setApiKey("");
        setStatus("已清除 API Key");
      })
      .catch((error) => {
        setStatus(typeof error === "string" ? error : "清除失败");
      })
      .finally(() => setBusy(false));
  }, []);

  const pasteUsageToken = React.useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUsageToken(text.trim());
      setUsageStatus("已从剪贴板读取");
    } catch {
      setUsageStatus("剪贴板读取失败");
    }
  }, []);

  const startUsageSync = React.useCallback(() => {
    setUsageSyncing(true);
    setUsageStatus("正在打开登录窗口…");
    void invoke<boolean>("start_usage_sync")
      .then((synced) => {
        if (!synced) {
          setUsageStatus("登录完成后，再次点击本按钮即可同步用量（可多点几次）");
        }
      })
      .catch((error) => {
        setUsageStatus(typeof error === "string" ? error : "打开登录窗口失败");
      })
      .finally(() => {
        window.setTimeout(() => setUsageSyncing(false), 2500);
      });
  }, []);

  const saveUsageToken = React.useCallback(() => {
    setBusy(true);
    void invoke<AppConfig>("save_usage_token", { usageToken })
      .then((nextConfig) => {
        setConfig(nextConfig);
        setUsageToken("");
        setUsageStatus("已保存，正在验证用量 Token…");
        return refreshUsageAfterToken("手动 Token 已保存");
      })
      .catch((error) => {
        setUsageStatus(typeof error === "string" ? error : "保存或验证失败");
      })
      .finally(() => setBusy(false));
  }, [refreshUsageAfterToken, usageToken]);

  const clearUsageToken = React.useCallback(() => {
    setBusy(true);
    void invoke<AppConfig>("clear_usage_token")
      .then((nextConfig) => {
        setConfig(nextConfig);
        setUsageToken("");
        setUsageStatus("已清除用量 Token");
        onUsageCleared();
      })
      .catch((error) => {
        setUsageStatus(typeof error === "string" ? error : "清除失败");
      })
      .finally(() => setBusy(false));
  }, [onUsageCleared]);

  const saveRefreshInterval = React.useCallback(
    (seconds: number) => {
      const previous = refresh;
      setRefresh(seconds);
      onRefreshIntervalChanged(seconds);
      void invoke<AppConfig>("save_refresh_interval", { refreshIntervalSeconds: seconds })
        .then((nextConfig) => {
          setConfig(nextConfig);
          setRefresh(nextConfig.refreshIntervalSeconds || 60);
          onRefreshIntervalChanged(nextConfig.refreshIntervalSeconds || 60);
        })
        .catch(() => {
          setRefresh(previous);
          onRefreshIntervalChanged(previous);
        });
    },
    [onRefreshIntervalChanged, refresh],
  );

  const saveAutoRefreshEnabled = React.useCallback(
    (enabled: boolean) => {
      const previous = autoRefresh;
      setAutoRefresh(enabled);
      onAutoRefreshChanged(enabled);
      void invoke<AppConfig>("save_auto_refresh_enabled", { autoRefreshEnabled: enabled })
        .then((nextConfig) => {
          setConfig(nextConfig);
          setAutoRefresh(nextConfig.autoRefreshEnabled);
          onAutoRefreshChanged(nextConfig.autoRefreshEnabled);
        })
        .catch(() => {
          setAutoRefresh(previous);
          onAutoRefreshChanged(previous);
        });
    },
    [autoRefresh, onAutoRefreshChanged],
  );

  const saveAutostart = React.useCallback(
    (enabled: boolean) => {
      const previous = autostart;
      setAutostart(enabled);
      void invoke<AppConfig>("save_autostart", { autostart: enabled })
        .then((nextConfig) => {
          setConfig(nextConfig);
          setAutostart(nextConfig.autostart);
        })
        .catch(() => setAutostart(previous));
    },
    [autostart],
  );

  return (
    <section className="settings-panel" data-testid="settings-panel">
      <button className="floating-close settings-close" onClick={onBack} aria-label="返回主面板">
        <X size={20} />
      </button>
      <div className="settings-inner">
        <header className="settings-header" data-tauri-drag-region>
          <BrandIcon size={42} />
          <div>
            <h1>MiMo Monitor</h1>
            <p>设置</p>
          </div>
        </header>

        <SettingsSection icon={<KeyRound size={15} />} title="API Key">
          <p>用于调用 MiMo API 获取余额和用量数据。当前 Windows 版本会保存在应用本地设置中。</p>
          <p className="muted">API Key 只在当前这台 Windows 电脑本地保留。</p>
          <p className="muted config-path">
            <span>本地位置：</span>
            <span>{configPath}</span>
          </p>
          <div className="key-row">
            <input
              aria-label="API Key"
              type="password"
              value={apiKey}
              placeholder={config?.apiKeyConfigured ? "••••••••••••••••••••••••••••••••••••••••••••••••••" : "sk-..."}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </div>
          <div className="settings-actions">
            <button className="primary" onClick={saveApiKey} disabled={busy || !apiKey.trim()}>
              验证并保存
            </button>
            <span className={config?.apiKeyConfigured ? "configured" : "configured muted-status"}>
              <CheckCircle2 size={17} />
              {config?.apiKeyConfigured ? "已配置" : "未配置"}
            </span>
            <button className="secondary" onClick={clearApiKey} disabled={busy || !config?.apiKeyConfigured}>
              清除 Key
            </button>
          </div>
        </SettingsSection>

        <SettingsSection icon={<BarChart3 size={15} />} title="用量同步 Token">
          <p>用于同步 Token 用量数据。MiMo 无官方用量 API，需网页登录 token（与上面的 API Key 不同）。</p>
          <p className="muted">方式一网页登录自动同步</p>
          <div className="settings-actions usage-sync-actions">
            <button className="primary" onClick={startUsageSync} disabled={usageSyncing}>
              {usageSyncing ? "等待登录" : "网页登录自动同步"}
            </button>
            <span className={config?.usageTokenConfigured ? "configured" : "configured muted-status"}>
              <CheckCircle2 size={17} />
              {config?.usageTokenConfigured ? "已配置" : "未配置"}
            </span>
            <button className="secondary" onClick={clearUsageToken} disabled={busy || !config?.usageTokenConfigured}>
              清除 Token
            </button>
          </div>
          <p className="muted">{usageStatus}</p>
          <button
            className="link-button"
            onClick={() => setShowManualPaste((value) => !value)}
          >
            {showManualPaste ? "收起手动粘贴" : "方式二：手动粘贴 token"}
          </button>
          {showManualPaste && (
            <>
              <p className="muted">
                获取：浏览器登录 platform.xiaomimimo.com，按 F12 打开控制台，输入
                JSON.parse(localStorage.userToken).value 回车，复制返回的字符串。
              </p>
              <p className="muted">token 会过期，用量查询失败时重新获取一次即可。</p>
              <div className="key-row">
                <input
                  aria-label="用量 Token"
                  type="password"
                  value={usageToken}
                  placeholder={config?.usageTokenConfigured ? "••••••••••••••••••••••••••••••••••••••••••••••••••" : ""}
                  onChange={(event) => setUsageToken(event.target.value)}
                />
              </div>
              <div className="settings-actions">
                <button className="primary" onClick={saveUsageToken} disabled={busy || !usageToken.trim()}>
                  保存 Token
                </button>
              </div>
            </>
          )}
        </SettingsSection>

        <SettingsSection icon={<Power size={15} />} title="开机自启">
          <p>开启后，每次登录 Windows 时自动启动 MiMo Monitor。</p>
          <Toggle label="登录时自动启动" checked={autostart} onChange={saveAutostart} />
        </SettingsSection>

        <SettingsSection icon={<RefreshCw size={15} />} title="自动刷新">
          <p>开启后，按设定周期自动从 MiMo API 拉取最新数据。</p>
          <Toggle label="启用自动刷新" checked={autoRefresh} onChange={saveAutoRefreshEnabled} />
          {autoRefresh && (
            <div className="segmented">
              {refreshOptions.map((option) => (
                <button
                  key={option.value}
                  className={refresh === option.value ? "selected" : ""}
                  onClick={() => saveRefreshInterval(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </SettingsSection>

        <SettingsSection icon={<Info size={15} />} title="关于">
          <div className="version-row">
            <span>当前版本</span>
            <strong>v{appVersion}</strong>
          </div>
        </SettingsSection>
      </div>
    </section>
  );
}

function SettingsSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <h2>
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i />
    </label>
  );
}

function DetailPanel({
  usage,
  usageState,
  onBack,
}: {
  usage: UsageResult | null;
  usageState: BalanceState;
  onBack: () => void;
}) {
  const items = usage?.items ?? [];
  const totalUsed = usage?.totalUsed ?? 0;
  const totalLimit = usage?.totalLimit ?? 0;
  const maxUsed = Math.max(...items.map((it) => it.used), 1);

  return (
    <section className="panel detail-panel" data-testid="detail-panel">
      <button className="floating-close" onClick={onBack} aria-label="返回主面板">
        <X size={20} />
      </button>
      <article className="card detail-hero" data-tauri-drag-region>
        <div className="model-badge large flash">
          <BarChart3 size={33} />
        </div>
        <div>
          <h1>用量明细</h1>
          <p>{usageState === "ok" ? `${items.length} 项 · 合计 ${fmtTokensShort(totalUsed)}` : "—"}</p>
        </div>
      </article>

      <div className="detail-metrics">
        <article className="card metric-card">
          <span>已用 Token</span>
          <strong className="flash">{usageState === "ok" ? fmtTokensShort(totalUsed) : "—"}</strong>
        </article>
        <article className="card metric-card">
          <span>总量上限</span>
          <strong className="flash">{usageState === "ok" ? fmtTokensShort(totalLimit) : "—"}</strong>
        </article>
      </div>

      <article className="card detail-chart">
        <div className="detail-chart-head">
          <div>
            <h2>各项用量</h2>
            <span>{usageState === "ok" ? `共 ${items.length} 项` : ""}</span>
          </div>
        </div>
        {usageState === "ok" && items.length > 0 ? (
          <div className="detail-items-list">
            {items.map((item) => {
              const width = maxUsed > 0 ? `${Math.max(2, (item.used / maxUsed) * 100)}%` : "0%";
              return (
                <div className="detail-item-row" key={item.name}>
                  <div className="detail-item-head">
                    <span className="item-name">{item.label}</span>
                    <span className="item-value">
                      {fmtInt(item.used)} / {fmtInt(item.limit)}
                    </span>
                  </div>
                  <div className="detail-item-bar">
                    <i className="brand-fill" style={{ width }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="chart-placeholder">
            {usageState === "nokey" ? "未配置用量 Token" : usageState === "loading" ? "查询中…" : "暂无数据"}
          </div>
        )}
      </article>
    </section>
  );
}

// Apply the saved theme before first render
document.documentElement.setAttribute("data-theme", localStorage.getItem("ui-theme") || "dark");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
