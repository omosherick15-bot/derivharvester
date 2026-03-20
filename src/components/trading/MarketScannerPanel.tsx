import React from 'react';
import { ALL_SYMBOLS, SymbolData } from '@/lib/trading-types';

interface Props {
  symbolsData: Map<string, SymbolData>;
  isTrading: boolean;
}

export const MarketScannerPanel: React.FC<Props> = ({ symbolsData, isTrading }) => {
  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Market Scanner {isTrading && <span className="text-active animate-pulse-profit">● SCANNING</span>}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
        {ALL_SYMBOLS.map((sym) => {
          const data = symbolsData.get(sym.symbol);
          const tickCount = data?.tickCount || 0;
          const hasMinTicks = tickCount >= 30;
          const readiness = Math.min(tickCount / 30, 1);
          const shortName = sym.name.replace(' Index', '').replace('Volatility ', 'V');

          // Compute a simple "edge score" from digit distribution skew
          let edgeLabel = 'Waiting...';
          let edgeColor = 'text-muted-foreground';
          if (hasMinTicks && data) {
            const total = data.recentWindow.length;
            if (total > 0) {
              const freq = new Array(10).fill(0);
              for (const d of data.recentWindow) freq[d]++;
              const maxFreq = Math.max(...freq);
              const skew = ((maxFreq / total) - 0.1) * 100; // deviation from uniform
              if (skew > 5) {
                edgeLabel = `Edge: +${skew.toFixed(1)}%`;
                edgeColor = 'text-profit';
              } else if (skew > 2) {
                edgeLabel = `Weak: +${skew.toFixed(1)}%`;
                edgeColor = 'text-harvest';
              } else {
                edgeLabel = 'No edge';
                edgeColor = 'text-muted-foreground';
              }
            }
          }

          return (
            <div
              key={sym.symbol}
              className="flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-2.5 py-1.5"
            >
              {/* Readiness indicator */}
              <div className="relative h-2 w-2 flex-shrink-0">
                <div
                  className={`absolute inset-0 rounded-full ${
                    hasMinTicks
                      ? 'bg-profit'
                      : tickCount > 0
                      ? 'bg-harvest animate-pulse'
                      : 'bg-muted-foreground/40'
                  }`}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-medium text-foreground truncate">{shortName}</span>
                  <span className={`text-[10px] font-mono font-semibold ${edgeColor}`}>
                    {edgeLabel}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="mt-0.5 h-1 w-full rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      hasMinTicks ? 'bg-profit' : 'bg-harvest'
                    }`}
                    style={{ width: `${readiness * 100}%` }}
                  />
                </div>
              </div>

              <span className="text-[10px] text-muted-foreground tabular-nums font-mono flex-shrink-0">
                {tickCount}t
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
