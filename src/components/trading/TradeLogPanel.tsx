import React from 'react';
import { TradeLog } from '@/lib/trading-types';

interface Props {
  logs: TradeLog[];
  onClearHistory: () => void;
}

export const TradeLogPanel: React.FC<Props> = ({ logs, onClearHistory }) => {
  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4 flex flex-col h-full max-h-[calc(100vh-120px)]">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Trade History ({logs.length})
        </h2>
        {logs.length > 0 && (
          <button
            onClick={onClearHistory}
            className="text-[10px] text-destructive hover:underline"
          >
            Clear All
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto space-y-1.5 scrollbar-thin">
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">No trades yet</p>
        ) : (
          logs.map(log => (
            <div
              key={log.id}
              className={`rounded-md border p-2 text-xs animate-slide-in ${
                log.result === 'win' ? 'border-profit bg-profit\/10' :
                log.result === 'loss' ? 'border-loss bg-loss\/10' :
                'border-border bg-secondary'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-medium">#{log.id} {log.symbolName}</span>
                <span className={`font-bold font-mono ${
                  log.result === 'win' ? 'text-profit' :
                  log.result === 'loss' ? 'text-loss' : 'text-muted-foreground'
                }`}>
                  {log.result === 'pending' ? '...' :
                   log.result === 'win' ? `+${log.profitLoss.toFixed(2)}` :
                   log.profitLoss.toFixed(2)}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                <span>
                  {log.contractType === 'CALL' ? '📈 RISE' : log.contractType === 'PUT' ? '📉 FALL' : `${log.contractType} ${log.digit}`}
                </span>
                <span>Conf: {log.confidence}%</span>
                <span>Stake: {log.stake.toFixed(2)}</span>
                <span>{log.duration}t</span>
                <span>{log.timestamp.toLocaleTimeString()}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
