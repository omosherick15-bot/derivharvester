import React from 'react';
import { SYMBOLS_1S, SYMBOLS_STANDARD, SymbolData } from '@/lib/trading-types';
import { useDerivLivePrices } from '@/hooks/use-deriv-live-prices';

interface Props {
  symbolsData: Map<string, SymbolData>;
}

export const LivePricesPanel: React.FC<Props> = ({ symbolsData }) => {
  const livePriceData = useDerivLivePrices(symbolsData);

  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Live Prices <span className="text-active animate-pulse-profit">●</span>
      </h2>

      <div className="mb-3">
        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Volatility (1s)
        </h3>
        <div className="grid grid-cols-2 gap-1 lg:grid-cols-4">
          {SYMBOLS_1S.map((sym) => (
            <PriceCell key={sym.symbol} name={sym.name} data={livePriceData.get(sym.symbol)} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Volatility (Standard)
        </h3>
        <div className="grid grid-cols-2 gap-1 lg:grid-cols-3">
          {SYMBOLS_STANDARD.map((sym) => (
            <PriceCell key={sym.symbol} name={sym.name} data={livePriceData.get(sym.symbol)} />
          ))}
        </div>
      </div>
    </div>
  );
};

const PriceCell: React.FC<{ name: string; data?: SymbolData }> = ({ name, data }) => {
  const price = data?.lastPrice || '—';
  const hasData = (data?.tickCount || 0) > 0;
  const shortName = name.replace(' Index', '').replace('Volatility ', 'V');

  return (
    <div
      className={`flex items-center justify-between rounded px-2 py-1.5 text-xs transition-colors ${
        hasData ? 'bg-secondary' : 'bg-secondary/40 opacity-50'
      }`}
    >
      <span className="mr-2 truncate font-medium text-foreground">{shortName}</span>
      <span className={`font-mono font-bold tabular-nums ${hasData ? 'text-active' : 'text-muted-foreground'}`}>
        {price}
      </span>
    </div>
  );
};
