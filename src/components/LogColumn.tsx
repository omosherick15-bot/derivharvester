// ===== Center Column: System Log + Trade History =====
import { useBotContext } from '../context/BotContext';
import { LogEntry, TradeRecord } from '../engine/types';
import { useState } from 'react';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const levelColors: Record<LogEntry['level'], string> = {
  info: 'text-muted-foreground',
  trade: 'text-accent',
  warn: 'text-warning',
  error: 'text-destructive',
  success: 'text-success',
};

function TradeRow({ trade }: { trade: TradeRecord }) {
  const resultColor = trade.result === 'win' ? 'text-success' : trade.result === 'loss' ? 'text-destructive' : 'text-muted-foreground';
  const resultBg = trade.result === 'win' ? 'bg-success/5' : trade.result === 'loss' ? 'bg-destructive/5' : '';
  
  return (
    <div className={`log-entry font-mono text-xs py-1.5 px-2 flex items-center gap-3 border-b border-border/30 ${resultBg}`}>
      <span className="text-muted-foreground shrink-0 w-6 text-right">#{trade.id}</span>
      <span className="text-primary shrink-0 w-20 truncate font-semibold">{trade.asset}</span>
      <span className="text-accent shrink-0 w-20">{trade.contractType}</span>
      <span className="text-muted-foreground shrink-0 w-10">b={trade.barrier}</span>
      <span className="text-foreground shrink-0 w-14">${trade.stake.toFixed(2)}</span>
      <span className="text-muted-foreground shrink-0 w-12">{(trade.confidence * 100).toFixed(0)}%</span>
      <span className={`shrink-0 w-10 font-bold uppercase ${resultColor}`}>
        {trade.result === 'pending' ? '...' : trade.result}
      </span>
      <span className={`shrink-0 w-16 text-right font-semibold ${resultColor}`}>
        {trade.result === 'pending' ? '—' : `${trade.profit >= 0 ? '+' : ''}$${trade.profit.toFixed(2)}`}
      </span>
      <span className="text-muted-foreground shrink-0 text-[10px]">{formatTime(trade.timestamp)}</span>
    </div>
  );
}

export function LogColumn() {
  const { logs, armed, trades } = useBotContext();
  const [tab, setTab] = useState<'log' | 'trades'>('log');

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab('log')}
          className={`px-4 py-2 font-label text-xs uppercase tracking-widest transition-colors ${
            tab === 'log' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          System Log
        </button>
        <button
          onClick={() => setTab('trades')}
          className={`px-4 py-2 font-label text-xs uppercase tracking-widest transition-colors relative ${
            tab === 'trades' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Trade History
          {trades.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-primary/20 text-primary">{trades.length}</span>
          )}
        </button>
      </div>

      {/* Trade Armed Block */}
      {armed && (
        <div className="mx-3 my-2 border border-accent rounded p-3 font-mono text-xs trade-armed-pulse bg-accent/5">
          <div className="text-accent font-bold mb-1">▶ TRADE ARMED</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-muted-foreground">ASSET</span>
            <span className="text-foreground">{armed.asset}</span>
            <span className="text-muted-foreground">CONTRACT</span>
            <span className="text-foreground">{armed.contractType}</span>
            <span className="text-muted-foreground">BARRIER</span>
            <span className="text-foreground">{armed.digit}</span>
            <span className="text-muted-foreground">CONFIDENCE</span>
            <span className="text-foreground">{(armed.confidence * 100).toFixed(1)}%</span>
            <span className="text-muted-foreground">EV</span>
            <span className="text-success">{armed.expectedValue.toFixed(4)}</span>
            <span className="text-muted-foreground">DURATION</span>
            <span className="text-foreground">{armed.duration}t</span>
          </div>
          <div className="mt-2 text-accent text-center font-bold animate-pulse">
            EXECUTING IN {armed.countdown}s...
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'log' ? (
          <div className="px-3 py-1">
            {logs.length === 0 && (
              <div className="text-muted-foreground text-xs py-4 text-center">
                Awaiting system initialization...
              </div>
            )}
            {logs.map((entry, i) => (
              <div key={i} className={`log-entry font-mono text-xs py-0.5 flex gap-2 ${levelColors[entry.level]}`}>
                <span className="text-muted-foreground shrink-0">[{formatTime(entry.timestamp)}]</span>
                <span className="shrink-0 w-16 truncate">[{entry.asset}]</span>
                <span className="shrink-0 font-bold">[{entry.event}]</span>
                <span className="truncate">{entry.data}</span>
              </div>
            ))}
          </div>
        ) : (
          <div>
            {trades.length === 0 && (
              <div className="text-muted-foreground text-xs py-4 text-center">
                No trades executed yet...
              </div>
            )}
            {/* Header */}
            {trades.length > 0 && (
              <div className="font-label text-[10px] text-muted-foreground uppercase px-2 py-1 flex items-center gap-3 border-b border-border bg-card/50 sticky top-0">
                <span className="w-6 text-right">#</span>
                <span className="w-20">Asset</span>
                <span className="w-20">Type</span>
                <span className="w-10">Bar.</span>
                <span className="w-14">Stake</span>
                <span className="w-12">Conf.</span>
                <span className="w-10">Result</span>
                <span className="w-16 text-right">P/L</span>
                <span>Time</span>
              </div>
            )}
            {trades.map((trade) => (
              <TradeRow key={trade.id} trade={trade} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
