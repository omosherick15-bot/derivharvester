import React from 'react';
import { SymbolData } from '@/lib/trading-types';

interface Props {
  data: SymbolData;
}

export const DigitHeatmap: React.FC<Props> = ({ data }) => {
  const total = data.recentWindow.length;
  if (total < 10) return null;

  const freq = new Array(10).fill(0);
  for (const d of data.recentWindow) freq[d]++;
  const maxFreq = Math.max(...freq);
  const minFreq = Math.min(...freq);

  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Digit Heatmap
        </h2>
        <span className="text-xs text-muted-foreground">{data.name} ({total} ticks)</span>
      </div>
      <div className="grid grid-cols-10 gap-1">
        {freq.map((f, digit) => {
          const intensity = maxFreq > minFreq ? (f - minFreq) / (maxFreq - minFreq) : 0.5;
          const pct = total > 0 ? ((f / total) * 100).toFixed(0) : '0';
          return (
            <div
              key={digit}
              className="rounded-md p-2 text-center transition-all"
              style={{
                backgroundColor: `hsl(${intensity > 0.6 ? 142 : intensity < 0.3 ? 0 : 210}, ${60 + intensity * 40}%, ${15 + intensity * 20}%)`,
              }}
            >
              <div className="text-sm font-bold font-mono">{digit}</div>
              <div className="text-xs opacity-75">{pct}%</div>
              <div className="text-xs opacity-50">{f}</div>
            </div>
          );
        })}
      </div>
      {/* Recent digits strip */}
      <div className="mt-2 flex gap-0.5 overflow-hidden">
        {data.recentWindow.slice(-30).map((d, i) => (
          <span
            key={i}
            className="text-xs font-mono w-5 h-5 flex items-center justify-center rounded bg-secondary text-muted-foreground"
          >
            {d}
          </span>
        ))}
      </div>
    </div>
  );
};
