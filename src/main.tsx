import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Eye,
  EyeOff,
  RefreshCcw,
  LogIn,
  LogOut,
  Circle,
  ChevronDown,
  TrendingUp,
  Wallet,
  Zap,
  Gift,
  X,
  Settings,
  ArrowLeft,
  Clock,
  HardDrive,
  Download,
  Github,
} from "lucide-react";

// ── 类型 ──

interface BalanceResult {
  accountType: string;
  planName?: string;
  totalBalance?: string;
  chargeBalance?: string;
  grantedBalance?: string;
  currency?: string;
  tokenBalance?: number;
  tokenLimit?: number;
  tokenUsed?: number;
}

interface UsageItem {
  name: string;
  label: string;
  used: number;
  limit: number;
  remaining: number;
  percent: number;
}

interface UsageResult {
  items: UsageItem[];
  totalUsed: number;
  totalLimit: number;
}

interface AppConfig {
  apiKeyConfigured: boolean;
  apiKeyPreview?: string;
  usageTokenConfigured: boolean;
  accountType?: string;
  refreshIntervalSeconds: number;
  autoRefreshEnabled: boolean;
  autostart: boolean;
  configPath: string;
}

type View = "main" | "settings" | "usage" | "login";

// ── 格式化工具 ──

function fmtBalance(value?: string): string {
  if (!value) return "-";
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return num.toFixed(2);
}

const REFRESH_OPTIONS = [
  { value: 60, label: "1 分钟" },
  { value: 300, label: "5 分钟" },
  { value: 1800, label: "30 分钟" },
  { value: 3600, label: "1 小时" },
];

function parseInterval(value: number): string {
  const opt = REFRESH_OPTIONS.find((o) => o.value === value);
  return opt ? opt.label : "1 分钟";
}

// ── 主应用 ──

export default function App() {
  const [view, setView] = useState<View>("main");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [balance, setBalance] = useState<BalanceResult | null>(null);
  const [usage, setUsage] = useState<UsageResult | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const usageRef = useRef(usage);

  useEffect(() => {
    usageRef.current = usage;
  }, [usage]);

  const loadConfig = useCallback(async () => {
    try {
      const value = await invoke<AppConfig>("get_app_config");
      setConfig(value);
      return value;
    } catch {
      // ignore
    }
  }, []);

  const fetchBalance = useCallback(async () => {
    setLoading(true);
    setBalanceError(null);
    try {
      const value = await invoke<BalanceResult>("fetch_balance");
      setBalance(value);
    } catch (error) {
      setBalanceError(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUsage = useCallback(async () => {
    setUsageLoading(true);
    try {
      const value = await invoke<UsageResult>("fetch_usage");
      setUsage(value);
    } catch {
      // ignore
    } finally {
      setUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig().then((value) => {
      if (value?.apiKeyConfigured) {
        fetchBalance();
      }
    });
  }, [loadConfig, fetchBalance]);

  useEffect(() => {
    if (!config) return;
    if (!config.autoRefreshEnabled || !config.apiKeyConfigured) return;
    const interval = setInterval(fetchBalance, config.refreshIntervalSeconds * 1000);
    return () => clearInterval(interval);
  }, [config, fetchBalance]);

  // 监听用量 token 自动捕获
  useEffect(() => {
    const unlisten = listen<AppConfig>("usage-token-captured", (event) => {
      setConfig(event.payload);
      setView("usage");
      fetchUsage();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [fetchUsage]);

  const handleSaveApiKey = useCallback(
    async (key: string) => {
      try {
        const value = await invoke<AppConfig>("save_api_key", { apiKey: key });
        setConfig(value);
        setBalanceError(null);
        fetchBalance();
      } catch (error) {
        setBalanceError(String(error));
      }
    },
    [fetchBalance],
  );

  const handleClearApiKey = useCallback(async () => {
    const value = await invoke<AppConfig>("clear_api_key");
    setConfig(value);
    setBalance(null);
    setBalanceError(null);
  }, []);

  const handleRefreshInterval = useCallback(
    async (seconds: number) => {
      const value = await invoke<AppConfig>("save_refresh_interval", {
        refreshIntervalSeconds: seconds,
      });
      setConfig(value);
    },
    [],
  );

  const handleAutoRefresh = useCallback(async (enabled: boolean) => {
    const value = await invoke<AppConfig>("save_auto_refresh_enabled", {
      autoRefreshEnabled: enabled,
    });
    setConfig(value);
  }, []);

  const handleAutostart = useCallback(async (enabled: boolean) => {
    const value = await invoke<AppConfig>("save_autostart", { autostart: enabled });
    setConfig(value);
  }, []);

  const handleStartUsageSync = useCallback(async () => {
    try {
      await invoke<boolean>("start_usage_sync");
      setView("login");
    } catch (error) {
      setBalanceError(String(error));
    }
  }, []);

  const handleClearUsageToken = useCallback(async () => {
    const value = await invoke<AppConfig>("clear_usage_token");
    setConfig(value);
    setUsage(null);
  }, []);

  if (!config) return null;

  return (
    <div className="app">
      <TitleBar onMinimize={() => invoke("hide_main_window")} view={view} />

      {view === "main" && (
        <MainView
          config={config}
          balance={balance}
          balanceError={balanceError}
          loading={loading}
          onRefresh={fetchBalance}
          onGoSettings={() => setView("settings")}
          onGoUsage={() => {
            setView("usage");
            if (!usageRef.current && config.usageTokenConfigured) {
              fetchUsage();
            }
          }}
          onSaveApiKey={handleSaveApiKey}
        />
      )}

      {view === "settings" && (
        <SettingsView
          config={config}
          onBack={() => setView("main")}
          onClearApiKey={handleClearApiKey}
          onRefreshInterval={handleRefreshInterval}
          onAutoRefresh={handleAutoRefresh}
          onAutostart={handleAutostart}
          onClearUsageToken={handleClearUsageToken}
        />
      )}

      {view === "usage" && (
        <UsageView
          config={config}
          usage={usage}
          loading={usageLoading}
          onBack={() => setView("main")}
          onRefresh={fetchUsage}
          onStartSync={handleStartUsageSync}
        />
      )}

      {view === "login" && (
        <LoginWaitView onBack={() => setView("main")} />
      )}
    </div>
  );
}

// ── 标题栏 ──

function TitleBar({
  onMinimize,
  view,
}: {
  onMinimize: () => void;
  view: View;
}) {
  return (
    <div
      className="title-bar"
      data-tauri-drag-region
      onDoubleClick={(event) => {
        event.stopPropagation();
        onMinimize();
      }}
    >
      <img className="title-logo" src="/logo.svg" alt="" />
      <span className="title-text">MiMo Monitor</span>
      {view === "settings" && <span className="title-sub">设置</span>}
      {view === "usage" && <span className="title-sub">用量</span>}
      {view === "login" && <span className="title-sub">登录</span>}
    </div>
  );
}

// ── 主视图 ──

function MainView({
  config,
  balance,
  balanceError,
  loading,
  onRefresh,
  onGoSettings,
  onGoUsage,
  onSaveApiKey,
}: {
  config: AppConfig;
  balance: BalanceResult | null;
  balanceError: string | null;
  loading: boolean;
  onRefresh: () => void;
  onGoSettings: () => void;
  onGoUsage: () => void;
  onSaveApiKey: (key: string) => void;
}) {
  const [keyInput, setKeyInput] = useState(config.apiKeyPreview || "");
  const [showKey, setShowKey] = useState(false);

  if (!config.apiKeyConfigured) {
    return (
      <div className="content">
        <div className="setup-section">
          <div className="setup-icon">
            <img src="/logo.svg" alt="" />
          </div>
          <h2 className="setup-title">配置 API Key</h2>
          <p className="setup-desc">
            输入你的 MiMo API Key，开始监控余额与用量。
          </p>
          <div className="api-input-wrap">
            <input
              className="api-input"
              type={showKey ? "text" : "password"}
              placeholder="sk-mimo-xxxxxxxxxxxxxx"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSaveApiKey(keyInput);
              }}
            />
            <button
              className="btn-icon"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button
            className="btn-primary"
            onClick={() => onSaveApiKey(keyInput)}
            disabled={!keyInput.trim()}
          >
            保存并连接
          </button>
          {balanceError && <p className="error-text">{balanceError}</p>}
        </div>
      </div>
    );
  }

  const isPayg = balance?.accountType === "payg";
  const isTokenPlan = balance?.accountType === "token_plan";

  return (
    <div className="content">
      {/* 余额卡片 */}
      <div className="balance-card">
        <div className="balance-header">
          <div className="balance-label">
            余额
            {balance?.planName && (
              <span className="plan-badge">{balance.planName}</span>
            )}
          </div>
          <button
            className="btn-icon"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCcw size={16} className={loading ? "spin" : ""} />
          </button>
        </div>

        {balanceError && <p className="error-text">{balanceError}</p>}

        {isPayg && balance && (
          <>
            <div className="balance-amount">
              <span className="amount-value">
                {fmtBalance(balance.totalBalance)}
              </span>
              <span className="amount-currency">
                {balance.currency || "CNY"}
              </span>
            </div>
            <div className="balance-details">
              <div className="detail-item">
                <Wallet size={14} />
                <span className="detail-label">充值余额</span>
                <span className="detail-value">
                  {fmtBalance(balance.chargeBalance)} {balance.currency || "CNY"}
                </span>
              </div>
              <div className="detail-item">
                <Gift size={14} />
                <span className="detail-label">赠送余额</span>
                <span className="detail-value">
                  {fmtBalance(balance.grantedBalance)} {balance.currency || "CNY"}
                </span>
              </div>
            </div>
          </>
        )}

        {isTokenPlan && balance && (
          <>
            <div className="balance-amount">
              <span className="amount-value">
                {balance.tokenBalance?.toFixed(0) ?? "-"}
              </span>
              <span className="amount-currency">
                / {balance.tokenLimit?.toFixed(0) ?? "-"}
              </span>
            </div>
            <div className="progress-bar-wrap">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${balance.tokenLimit && balance.tokenUsed ? Math.min((balance.tokenUsed / balance.tokenLimit) * 100, 100) : 0}%`,
                }}
              />
            </div>
            <p className="progress-label">
              已用 {balance.tokenUsed?.toFixed(0) ?? "-"} /{" "}
              {balance.tokenLimit?.toFixed(0) ?? "-"}
            </p>
          </>
        )}
      </div>

      {/* 快捷操作 */}
      <div className="actions">
        <button
          className={`action-item ${config.usageTokenConfigured ? "active" : ""}`}
          onClick={onGoUsage}
        >
          <TrendingUp size={20} />
          <span>用量</span>
        </button>
        <button className="action-item" onClick={onGoSettings}>
          <Settings size={20} />
          <span>设置</span>
        </button>
      </div>

      {/* API Key 状态 */}
      <div className="status-bar">
        <Circle size={8} className="status-dot" />
        <span className="status-text">
          {config.apiKeyPreview || "已连接"}
        </span>
      </div>
    </div>
  );
}

// ── 用量视图 ──

function UsageView({
  config,
  usage,
  loading,
  onBack,
  onRefresh,
  onStartSync,
}: {
  config: AppConfig;
  usage: UsageResult | null;
  loading: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onStartSync: () => void;
}) {
  if (!config.usageTokenConfigured) {
    return (
      <div className="content">
        <div className="setup-section">
          <div className="setup-icon">
            <TrendingUp size={48} />
          </div>
          <h2 className="setup-title">同步用量数据</h2>
          <p className="setup-desc">
            登录 MiMo 平台以自动获取用量 Token，或在设置中手动粘贴。
          </p>
          <button className="btn-primary" onClick={onStartSync}>
            <LogIn size={16} />
            登录 MiMo 平台
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="section-header">
        <button className="btn-icon" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <h3 className="section-title">用量详情</h3>
        <button className="btn-icon" onClick={onRefresh} disabled={loading}>
          <RefreshCcw size={16} className={loading ? "spin" : ""} />
        </button>
      </div>

      {usage ? (
        <div className="usage-list">
          {usage.items.map((item) => (
            <div key={item.name} className="usage-item">
              <div className="usage-item-header">
                <span className="usage-item-name">{item.label}</span>
                <span className="usage-item-value">
                  {item.used.toFixed(0)} / {item.limit.toFixed(0)}
                </span>
              </div>
              <div className="progress-bar-wrap small">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${Math.min(item.percent, 100)}%` }}
                />
              </div>
            </div>
          ))}
          <div className="usage-total">
            <span>合计</span>
            <span>
              {usage.totalUsed.toFixed(0)} / {usage.totalLimit.toFixed(0)}
            </span>
          </div>
        </div>
      ) : (
        <p className="empty-text">暂无用量数据</p>
      )}
    </div>
  );
}

// ── 登录等待视图 ──

function LoginWaitView({ onBack }: { onBack: () => void }) {
  return (
    <div className="content">
      <div className="section-header">
        <button className="btn-icon" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <h3 className="section-title">等待登录</h3>
      </div>
      <div className="setup-section">
        <div className="login-hint">
          <LogIn size={32} />
          <p>请在弹出的浏览器窗口中登录 MiMo 平台</p>
          <p className="hint-sub">登录成功后系统将自动提取用量 Token</p>
        </div>
      </div>
    </div>
  );
}

// ── 设置视图 ──

function SettingsView({
  config,
  onBack,
  onClearApiKey,
  onRefreshInterval,
  onAutoRefresh,
  onAutostart,
  onClearUsageToken,
}: {
  config: AppConfig;
  onBack: () => void;
  onClearApiKey: () => void;
  onRefreshInterval: (seconds: number) => void;
  onAutoRefresh: (enabled: boolean) => void;
  onAutostart: (enabled: boolean) => void;
  onClearUsageToken: () => void;
}) {
  const [intervalOpen, setIntervalOpen] = useState(false);
  const [usageTokenInput, setUsageTokenInput] = useState("");

  const handleSaveUsageToken = async () => {
    try {
      const value = await invoke<AppConfig>("save_usage_token", {
        usageToken: usageTokenInput,
      });
      setConfig(value);
      setUsageTokenInput("");
    } catch {
      // ignore
    }
  };

  function setConfig(value: AppConfig) {
    // ref 不受 state 控制，这里通过闭包更新依赖
    // 简单处理：重新渲染即可
  }

  return (
    <div className="content">
      <div className="section-header">
        <button className="btn-icon" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <h3 className="section-title">设置</h3>
      </div>

      <div className="settings-list">
        {/* 余额刷新 */}
        <div className="setting-item">
          <div className="setting-left">
            <Clock size={16} />
            <span className="setting-label">自动刷新</span>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={config.autoRefreshEnabled}
              onChange={(event) => onAutoRefresh(event.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="setting-item">
          <div className="setting-left">
            <RefreshCcw size={16} />
            <span className="setting-label">刷新间隔</span>
          </div>
          <div className="dropdown" onClick={() => setIntervalOpen(!intervalOpen)}>
            <span>{parseInterval(config.refreshIntervalSeconds)}</span>
            <ChevronDown size={14} />
            {intervalOpen && (
              <div className="dropdown-menu">
                {REFRESH_OPTIONS.map((opt) => (
                  <div
                    key={opt.value}
                    className={`dropdown-item ${config.refreshIntervalSeconds === opt.value ? "selected" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRefreshInterval(opt.value);
                      setIntervalOpen(false);
                    }}
                  >
                    {opt.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 开机自启 */}
        <div className="setting-item">
          <div className="setting-left">
            <HardDrive size={16} />
            <span className="setting-label">开机自启</span>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={config.autostart}
              onChange={(event) => onAutostart(event.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="setting-divider" />

        {/* API Key */}
        <div className="setting-item">
          <div className="setting-left">
            <span className="setting-label">API Key</span>
          </div>
          <span className="setting-value">
            {config.apiKeyPreview || "未配置"}
          </span>
        </div>

        {config.apiKeyConfigured && (
          <button className="btn-link danger" onClick={onClearApiKey}>
            清除 API Key
          </button>
        )}

        {/* 用量 Token */}
        <div className="setting-item">
          <div className="setting-left">
            <span className="setting-label">用量 Token</span>
          </div>
          <span className="setting-value">
            {config.usageTokenConfigured ? "已配置" : "未配置"}
          </span>
        </div>

        {!config.usageTokenConfigured && (
          <div className="token-input-group">
            <input
              className="api-input small"
              placeholder="粘贴 api-platform_serviceToken"
              value={usageTokenInput}
              onChange={(event) => setUsageTokenInput(event.target.value)}
            />
            <button
              className="btn-primary small"
              disabled={!usageTokenInput.trim()}
              onClick={handleSaveUsageToken}
            >
              保存
            </button>
          </div>
        )}

        {config.usageTokenConfigured && (
          <button className="btn-link danger" onClick={onClearUsageToken}>
            清除用量 Token
          </button>
        )}

        <div className="setting-divider" />

        {/* 关于 */}
        <div className="setting-item">
          <div className="setting-left">
            <span className="setting-label">版本</span>
          </div>
          <span className="setting-value">1.0.0</span>
        </div>

        <div className="setting-item">
          <div className="setting-left">
            <span className="setting-label">配置路径</span>
          </div>
          <span className="setting-value mono">{config.configPath}</span>
        </div>

        <a
          className="setting-item link"
          href="https://github.com/mixiaosu/MiMoMonitor"
          target="_blank"
          rel="noreferrer"
        >
          <div className="setting-left">
            <Github size={16} />
            <span className="setting-label">GitHub</span>
          </div>
          <ChevronDown size={14} style={{ transform: "rotate(-90deg)" }} />
        </a>
      </div>
    </div>
  );
}
