import React from 'react';
import { TradingStats } from '@/lib/trading-types';

interface Props {
  stats: TradingStats;
}

export const StatsPanel: React.FC<Props> = ({ stats }) => {
  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4 space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statistics</h2>
      <div className="space-y-1 text-sm">
        <Row label="Total Trades" value={stats.totalTrades.toString()} />
        <Row label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} color={stats.winRate >= 55 ? 'text-profit' : stats.winRate > 0 ? 'text-loss' : ''} />
        <Row label="Session P/L" value={`${stats.sessionProfit >= 0 ? '+' : ''}${stats.sessionProfit.toFixed(2)}`} color={stats.sessionProfit >= 0 ? 'text-profit' : 'text-loss'} />
        <Row label="Harvested" value={`+${stats.harvestedProfit.toFixed(2)}`} color="text-harvest" />
        <Row label="Win Streak" value={stats.consecutiveWins.toString()} />
        <Row label="Loss Streak" value={stats.consecutiveLosses.toString()} color={stats.consecutiveLosses >= 2 ? 'text-loss' : ''} />
        <Row label="Current Stake" value={stats.currentStake.toFixed(2)} />
        {stats.isRecoveryMode && (
          <div className="pt-1">
            <span className="text-xs bg-loss\/10 text-loss px-2 py-0.5 rounded">RECOVERY MODE</span>
          </div>
        )}
        {stats.activeSymbol && (
          <div className="pt-1 text-xs text-muted-foreground truncate">
            Active: <span className="text-active">{stats.activeSymbol}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div className="flex justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className={`font-mono ${color || ''}`}>{value}</span>
  </div>
);
