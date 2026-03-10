// ===== Market Column: asset list with sparklines =====
import { MONITORED_ASSETS, DigitData } from '../engine/types';
import { useBotContext } from '../context/BotContext';

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return <span className="text-muted-foreground">---</span>;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 60;
  const h = 16;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} className="inline-block ml-2">
      <polyline
        points={points}
        fill="none"
        stroke="hsl(var(--muted-foreground))"
        strokeWidth="1"
      />
    </svg>
  );
}

export function MarketColumn() {
  const { digitDataMap, state } = useBotContext();

  return (
    <div className="flex flex-col h-full border-r border-border">
      <div className="px-3 py-2 border-b border-border font-label text-xs text-muted-foreground uppercase tracking-widest">
        Market
      </div>
      <div className="flex-1 overflow-y-auto">
        {MONITORED_ASSETS.map(asset => {
          const dd = digitDataMap.get(asset.symbol);
          const isActive = state?.activeAsset === asset.name;
          const lastDigit = dd?.recentWindow[dd.recentWindow.length - 1];

          return (
            <div
              key={asset.symbol}
              className={`flex items-center justify-between px-3 py-1.5 font-mono text-xs border-b border-border transition-colors ${
                isActive ? 'text-primary bg-primary/5' : 'text-foreground'
              }`}
            >
              <span className="truncate w-20">{asset.name}</span>
              <span className="text-muted-foreground w-4 text-center">
                {lastDigit !== undefined ? lastDigit : '-'}
              </span>
              <Sparkline data={dd?.sparkline || []} />
              <span className="text-muted-foreground w-8 text-right">
                {dd ? dd.recentDigits.length : 0}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
