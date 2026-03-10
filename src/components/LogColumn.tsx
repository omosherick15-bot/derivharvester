// ===== Center Column: System Log =====
import { useBotContext } from '../context/BotContext';
import { LogEntry } from '../engine/types';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const levelColors: Record<LogEntry['level'], string> = {
  info: 'text-muted-foreground',
  trade: 'text-primary',
  warn: 'text-primary',
  error: 'text-destructive',
  success: 'text-success',
};

export function LogColumn() {
  const { logs, armed } = useBotContext();

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border font-label text-xs text-muted-foreground uppercase tracking-widest">
        System Log
      </div>

      {/* Trade Armed Block */}
      {armed && (
        <div className="mx-3 my-2 border border-primary p-3 font-mono text-xs trade-armed-pulse">
          <div className="text-primary font-bold mb-1">▶ TRADE ARMED</div>
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
          <div className="mt-2 text-primary text-center font-bold">
            EXECUTING IN {armed.countdown}s...
          </div>
        </div>
      )}

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto px-3 py-1">
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
    </div>
  );
}
