import React from 'react';
import { Prediction, SymbolData } from '@/lib/trading-types';

interface Props {
  predictions: Prediction[];
  isTrading: boolean;
  symbolsData?: Map<string, SymbolData>;
}

export const PredictionPanel: React.FC<Props> = ({ predictions, isTrading, symbolsData }) => {
  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Live Predictions {isTrading && <span className="text-active animate-pulse-profit">● ACTIVE</span>}
      </h2>
      {predictions.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          {isTrading ? 'Scanning for statistical edge...' : 'Start trading to see predictions'}
        </p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
          {predictions.map((pred, i) => (
            <div
              key={`${pred.symbol}-${pred.contractType}-${pred.digit}-${i}`}
              className={`rounded-md border p-2 text-xs ${
                i === 0 ? 'border-active bg-active\/10 glow-active' : 'border-border bg-secondary'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium">{pred.symbolName}</span>
                <span className="font-mono text-active font-bold">
                  {(() => {
                    const symData = symbolsData?.get(pred.symbol);
                    return symData?.lastPrice ? `${symData.lastPrice}` : '—';
                  })()}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 text-muted-foreground">
                <span className="text-foreground font-medium">
                  {pred.contractType === 'CALL' ? '📈 RISE' : pred.contractType === 'PUT' ? '📉 FALL' : `${pred.contractType} ${pred.digit}`}
                </span>
                <span>Conf: {pred.confidence}%</span>
                <span>{pred.duration}t</span>
                <span className="text-xs opacity-75">{pred.source}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
