// ===== Configuration Screen =====
import { useState } from 'react';
import { BotConfig, DEFAULT_CONFIG } from '../engine/types';

interface ConfigScreenProps {
  onStart: (config: BotConfig) => void;
}

function Field({ label, value, onChange, type = 'number', placeholder, hint }: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="mb-4">
      <label className="block font-label text-xs text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-secondary border border-border px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
      />
      {hint && <p className="mt-1 font-label text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ConfigScreen({ onStart }: ConfigScreenProps) {
  const [config, setConfig] = useState<BotConfig>({ ...DEFAULT_CONFIG });
  const [autoTicks, setAutoTicks] = useState(true);

  const update = (key: keyof BotConfig, raw: string) => {
    const val = key === 'apiToken' ? raw : parseFloat(raw) || 0;
    setConfig(prev => ({ ...prev, [key]: val }));
  };

  const handleStart = () => {
    const finalConfig = {
      ...config,
      tickDuration: autoTicks ? null : (config.tickDuration || 5),
    };
    onStart(finalConfig);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg border border-border p-6">
        <h1 className="font-mono text-lg font-bold text-primary mb-1">
          ADVANCED HARVEST TRADER
        </h1>
        <p className="font-label text-xs text-muted-foreground mb-6 uppercase tracking-widest">
          Configuration Terminal
        </p>

        <div className="grid grid-cols-2 gap-x-4">
          <Field
            label="Initial Stake ($)"
            value={config.initialStake}
            onChange={v => update('initialStake', v)}
            hint="Base stake amount"
          />
          <Field
            label="Recovery Multiplier"
            value={config.recoveryMultiplier}
            onChange={v => update('recoveryMultiplier', v)}
            hint="Stake × multiplier on loss"
          />
          <div className="mb-4 col-span-2">
            <label className="flex items-center gap-2 font-label text-xs text-muted-foreground uppercase tracking-wider cursor-pointer">
              <input
                type="checkbox"
                checked={autoTicks}
                onChange={e => setAutoTicks(e.target.checked)}
                className="accent-primary"
              />
              Auto-select tick duration
            </label>
          </div>
          {!autoTicks && (
            <Field
              label="Tick Duration"
              value={config.tickDuration || 5}
              onChange={v => update('tickDuration', v)}
              hint="1-10 ticks"
            />
          )}
          <Field
            label="Trades per Symbol"
            value={config.tradesPerSymbol}
            onChange={v => update('tradesPerSymbol', v)}
          />
          <Field
            label="Symbols per Cycle"
            value={config.symbolsPerCycle}
            onChange={v => update('symbolsPerCycle', v)}
          />
          <Field
            label="Harvest After Wins"
            value={config.harvestAfterWins}
            onChange={v => update('harvestAfterWins', v)}
            hint="Consecutive wins to harvest"
          />
          <Field
            label="Max Total Trades"
            value={config.maxTotalTrades}
            onChange={v => update('maxTotalTrades', v)}
          />
          <Field
            label="Max Consec. Losses"
            value={config.maxConsecutiveLosses}
            onChange={v => update('maxConsecutiveLosses', v)}
          />
          <Field
            label="Risk Threshold ($)"
            value={config.riskThresholdBalance}
            onChange={v => update('riskThresholdBalance', v)}
            hint="Min balance before stop"
          />
          <Field
            label="Confidence (%)"
            value={Math.round(config.confidenceThreshold * 100)}
            onChange={v => update('confidenceThreshold', (parseFloat(v) / 100).toString())}
            hint="Min probability to trade"
          />
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <Field
            label="Deriv API Token"
            value={config.apiToken}
            onChange={v => update('apiToken', v)}
            type="password"
            placeholder="Leave empty for demo mode"
            hint="Optional. Demo mode simulates trades."
          />
          <Field
            label="App ID"
            value={config.appId}
            onChange={v => update('appId', v)}
            hint="Deriv app ID (default: 1089)"
          />
        </div>

        <button
          onClick={handleStart}
          className="w-full mt-6 py-3 font-label text-sm font-bold uppercase tracking-widest bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          ▶ Initialize System
        </button>
      </div>
    </div>
  );
}
