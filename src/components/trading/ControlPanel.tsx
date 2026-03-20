import React from 'react';
import { TradingConfig, ContractCategory } from '@/lib/trading-types';

interface Props {
  isTrading: boolean;
  onStart: () => void;
  onStop: () => void;
  config: TradingConfig;
  onConfigChange: (config: TradingConfig) => void;
}

const CATEGORY_LABELS: { key: ContractCategory; label: string }[] = [
  { key: 'over_under', label: 'Over / Under' },
  { key: 'match_differ', label: 'Match / Differ' },
  { key: 'even_odd', label: 'Even / Odd' },
  { key: 'rise_fall', label: 'Rise / Fall' },
];

export const ControlPanel: React.FC<Props> = ({ isTrading, onStart, onStop, config, onConfigChange }) => {
  const toggleCategory = (cat: ContractCategory) => {
    const current = config.enabledCategories;
    const next = current.includes(cat)
      ? current.filter(c => c !== cat)
      : [...current, cat];
    if (next.length === 0) return; // Must have at least one
    onConfigChange({ ...config, enabledCategories: next });
  };

  const updateField = (field: keyof TradingConfig, value: number | boolean) => {
    onConfigChange({ ...config, [field]: value });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Controls</h2>

      <button
        onClick={isTrading ? onStop : onStart}
        className={`w-full rounded-md py-2 text-sm font-bold transition-all ${
          isTrading
            ? 'bg-destructive text-destructive-foreground hover:opacity-90'
            : 'bg-profit text-foreground hover:opacity-90 glow-profit'
        }`}
      >
        {isTrading ? '■ STOP TRADING' : '▶ START TRADING'}
      </button>

      {/* Trade Options */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Trade Options</label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleCategory(key)}
              disabled={config.under4Over5Mode}
              className={`px-2 py-1 rounded text-xs font-medium transition-all border ${
                config.under4Over5Mode
                  ? 'bg-secondary/50 text-muted-foreground/50 border-border cursor-not-allowed'
                  : config.enabledCategories.includes(key)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-secondary text-muted-foreground border-border hover:border-muted-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {config.enabledCategories.length === 4 && !config.under4Over5Mode && (
          <span className="text-[10px] text-harvest">Auto: all options enabled</span>
        )}
      </div>

      {/* Under 4 / Over 5 Specialist Mode */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Specialist Mode</label>
        <button
          onClick={() => onConfigChange({ ...config, under4Over5Mode: !config.under4Over5Mode })}
          className={`w-full px-3 py-2 rounded text-xs font-bold transition-all border ${
            config.under4Over5Mode
              ? 'bg-active/20 text-active border-active glow-active'
              : 'bg-secondary text-muted-foreground border-border hover:border-muted-foreground'
          }`}
        >
          {config.under4Over5Mode ? '✦ Under 4 / Over 5 — ACTIVE' : '✦ Under 4 / Over 5'}
        </button>
        <span className="text-[10px] text-muted-foreground">
          {config.under4Over5Mode
            ? '6-layer algorithm: Frequency, Streaks, Markov, Entropy, Recency, Autocorrelation'
            : 'Enable to trade only Under 4 and Over 5 with advanced 6-layer analysis'}
        </span>
      </div>

      {/* Ticks Window */}
      <div className="space-y-1 text-xs">
        <div className="flex justify-between text-muted-foreground">
          <span>Ticks Window</span>
        </div>
        <input
          type="number"
          min="0"
          max="200"
          value={config.ticksWindow || ''}
          placeholder="Auto: 50"
          onChange={e => updateField('ticksWindow', Math.max(0, Math.min(200, parseInt(e.target.value || '0'))))}
          className="w-full rounded bg-secondary px-2 py-1 text-xs font-mono text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
        />
        <span className="text-[10px] text-muted-foreground">Number of ticks for analysis window</span>
      </div>

      {/* Settings */}
      <div className="space-y-2 text-xs">
        <div className="space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Initial Stake</span>
          </div>
          <input
            type="number"
            step="0.01"
            min="0"
            value={config.initialStake || ''}
            placeholder="Auto: 0.35"
            onChange={e => updateField('initialStake', Math.round(parseFloat(e.target.value || '0') * 100) / 100)}
            className="w-full rounded bg-secondary px-2 py-1 text-xs font-mono text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Take Profit & Stop Loss */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className="text-muted-foreground">Take Profit</div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={config.takeProfit || ''}
              placeholder={`Auto: ${((config.initialStake || 0.35) * 5).toFixed(2)}`}
              onChange={e => updateField('takeProfit', Math.round(parseFloat(e.target.value || '0') * 100) / 100)}
              className="w-full rounded bg-secondary px-2 py-1 text-xs font-mono text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
            />
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Stop Loss</div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={config.stopLoss || ''}
              placeholder="Auto: 0.50"
              onChange={e => updateField('stopLoss', Math.round(parseFloat(e.target.value || '0') * 100) / 100)}
              className="w-full rounded bg-secondary px-2 py-1 text-xs font-mono text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
            />
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground">TP: session profit target • SL: max loss or harvested profit drawdown</span>

        <div className="space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Duration (ticks)</span>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={config.autoPickDuration}
                onChange={e => updateField('autoPickDuration', e.target.checked)}
                className="rounded"
              />
              <span>Auto</span>
            </label>
          </div>
          {!config.autoPickDuration && (
            <input
              type="number"
              min="0"
              max="10"
              value={config.manualDuration || ''}
              placeholder="Auto: 5"
              onChange={e => updateField('manualDuration', Math.min(10, Math.max(0, parseInt(e.target.value || '0'))))}
              className="w-full rounded bg-secondary px-2 py-1 text-xs font-mono text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
            />
          )}
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Harvest After (wins)</span>
          </div>
          <input
            type="number"
            min="0"
            max="20"
            value={config.maxConsecutiveWinsForHarvest || ''}
            placeholder="Auto: 3"
            onChange={e => updateField('maxConsecutiveWinsForHarvest', Math.max(0, parseInt(e.target.value || '0')))}
            className="w-full rounded bg-secondary px-2 py-1 text-xs font-mono text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Max Consecutive Losses</span>
          </div>
          <input
            type="number"
            min="0"
            max="20"
            value={config.maxConsecutiveLosses || ''}
            placeholder="Auto: 3"
            onChange={e => updateField('maxConsecutiveLosses', Math.max(0, parseInt(e.target.value || '0')))}
            className="w-full rounded bg-secondary px-2 py-1 text-xs font-mono text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
          />
          <span className="text-[10px] text-muted-foreground">Bot stops after this many losses in a row</span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Maximum Trades</span>
          </div>
          <input
            type="number"
            min="0"
            max="100"
            value={config.maxAutomatedTrades || ''}
            placeholder="Auto: 5"
            onChange={e => updateField('maxAutomatedTrades', Math.max(0, Math.min(100, parseInt(e.target.value || '0'))))}
            className="w-full rounded bg-secondary px-2 py-1 text-xs font-mono text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
          />
          <span className="text-[10px] text-muted-foreground">Stops auto trading after this many settled trades</span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Trades per Symbol</span>
          </div>
          <input
            type="number"
            min="0"
            max="20"
            value={config.tradesPerSymbol || ''}
            placeholder="Auto: 4"
            onChange={e => updateField('tradesPerSymbol', Math.max(0, parseInt(e.target.value || '0')))}
            className="w-full rounded bg-secondary px-2 py-1 text-xs font-mono text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
          />
          <span className="text-[10px] text-muted-foreground">Max trades on one symbol before rotating</span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Symbols per Cycle</span>
          </div>
          <input
            type="number"
            min="0"
            max="13"
            value={config.symbolsPerCycle || ''}
            placeholder="Auto: 4"
            onChange={e => updateField('symbolsPerCycle', Math.max(0, Math.min(13, parseInt(e.target.value || '0'))))}
            className="w-full rounded bg-secondary px-2 py-1 text-xs font-mono text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
          />
          <span className="text-[10px] text-muted-foreground">Symbols traded before any can repeat</span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Recovery Mode Category</span>
          </div>
          <select
            value={config.recoveryCategory}
            onChange={e => onConfigChange({ ...config, recoveryCategory: e.target.value as ContractCategory })}
            className="w-full rounded bg-secondary px-2 py-1 text-xs font-mono text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {CATEGORY_LABELS.map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <span className="text-[10px] text-muted-foreground">Category to switch to after a loss</span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Confidence (%)</span>
          </div>
          <input
            type="number"
            min="0"
            max="95"
            value={config.confidenceThreshold || ''}
            placeholder="Auto: 60"
            onChange={e => updateField('confidenceThreshold', Math.max(0, Math.min(95, parseInt(e.target.value || '0'))))}
            className="w-full rounded bg-secondary px-2 py-1 text-xs font-mono text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Recovery Multiplier</span>
          </div>
          <input
            type="number"
            step="0.1"
            min="0"
            max="5"
            value={config.recoveryMultiplier || ''}
            placeholder="Auto: 1.5"
            onChange={e => updateField('recoveryMultiplier', Math.round(parseFloat(e.target.value || '0') * 10) / 10)}
            className="w-full rounded bg-secondary px-2 py-1 text-xs font-mono text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
          />
        </div>
      </div>
    </div>
  );
};
