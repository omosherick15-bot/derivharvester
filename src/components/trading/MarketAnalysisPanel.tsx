import React from 'react';
import { SymbolData } from '@/lib/trading-types';

interface Props {
  data: SymbolData;
  ticksWindow: number;
}

export const MarketAnalysisPanel: React.FC<Props> = ({ data, ticksWindow }) => {
  const win = ticksWindow || 50;
  const digits = data.recentDigits.slice(-win);
  const eoDigits = digits.slice(-30);
  const ouDigits = digits.slice(-30);

  const overUnderAnalysis = React.useMemo(() => {
    if (ouDigits.length < 10) return null;
    const total = ouDigits.length;
    let bestContract = '';
    let bestProb = 0;
    for (let target = 2; target <= 7; target++) {
      const oc = ouDigits.filter(d => d > target).length / total;
      if (oc > bestProb) { bestProb = oc; bestContract = `Over ${target}`; }
      const uc = ouDigits.filter(d => d < target).length / total;
      if (uc > bestProb) { bestProb = uc; bestContract = `Under ${target}`; }
    }
    return { contract: bestContract, probability: bestProb };
  }, [ouDigits]);

  const freq = new Array(10).fill(0);
  for (const d of digits) freq[d]++;

  if (digits.length < 10) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Market Analysis
        </h2>
        <span className="text-xs text-muted-foreground">
          {data.name} ({digits.length} ticks)
        </span>
      </div>

      {/* Even / Odd Analysis */}
      <div className="space-y-1">
        <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
          Recent Even / Odd
        </span>
        <div className="flex gap-0.5 flex-wrap">
          {eoDigits.map((d, i) => {
            const isEven = d % 2 === 0;
            return (
              <div
                key={i}
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                  isEven
                    ? 'bg-blue-600 text-blue-100'
                    : 'bg-yellow-500 text-yellow-900'
                }`}
                title={`Digit: ${d} — ${isEven ? 'Even' : 'Odd'}`}
              >
                {isEven ? 'E' : 'O'}
              </div>
            );
          })}
        </div>
      </div>

      {/* Over / Under Analysis */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
            Recent Over / Under
          </span>
          {overUnderAnalysis && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-accent text-accent-foreground">
              Best: {overUnderAnalysis.contract} ({(overUnderAnalysis.probability * 100).toFixed(0)}%)
            </span>
          )}
        </div>
        <div className="flex gap-0.5 flex-wrap">
          {ouDigits.map((d, i) => {
            const isOver = d >= 5;
            return (
              <div
                key={i}
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                  isOver
                    ? 'bg-emerald-600 text-emerald-100'
                    : 'bg-gray-500 text-gray-100'
                }`}
                title={`Digit: ${d} — ${isOver ? 'Over' : 'Under'}`}
              >
                {isOver ? 'O' : 'U'}
              </div>
            );
          })}
        </div>
        {/* Over/Under breakdown per threshold */}
        {ouDigits.length >= 10 && (
          <div className="grid grid-cols-6 gap-1 mt-1">
            {[2, 3, 4, 5, 6, 7].map(target => {
              const overPct = ((ouDigits.filter(d => d > target).length / ouDigits.length) * 100).toFixed(0);
              const underPct = ((ouDigits.filter(d => d < target).length / ouDigits.length) * 100).toFixed(0);
              return (
                <div key={target} className="text-center rounded bg-secondary p-1">
                  <div className="text-[9px] font-bold text-foreground">{target}</div>
                  <div className="text-[8px] text-profit">O:{overPct}%</div>
                  <div className="text-[8px] text-muted-foreground">U:{underPct}%</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Matches / Differ */}
      <div className="space-y-1">
        <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
          Matches / Differ
        </span>
        <div className="grid grid-cols-10 gap-1">
          {freq.map((count, digit) => (
            <div key={digit} className="flex flex-col items-center">
              <div className="w-7 h-7 rounded-full border border-border bg-secondary flex items-center justify-center text-xs font-bold text-foreground">
                {digit}
              </div>
              <span className="text-[9px] text-muted-foreground mt-0.5 font-mono">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
