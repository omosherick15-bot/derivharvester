// ===== Right Column: Vitals HUD =====
import { useBotContext } from '../context/BotContext';

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-border">
      <span className="font-label text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`font-mono text-sm font-semibold ${color || 'text-foreground'}`}>{value}</span>
    </div>
  );
}

const statusColors: Record<string, string> = {
  IDLE: 'text-muted-foreground',
  CONFIGURING: 'text-muted-foreground',
  MONITORING: 'text-foreground',
  TRADE_ARMED: 'text-primary',
  EXECUTING: 'text-primary',
  IN_RECOVERY: 'text-destructive',
  STOPPED: 'text-destructive',
};

export function VitalsColumn() {
  const { state, emergencyStop, isRunning } = useBotContext();

  const winRate = state && state.totalTrades > 0
    ? ((state.wins / state.totalTrades) * 100).toFixed(1) + '%'
    : '—';

  const profitColor = state && state.currentProfit >= 0 ? 'text-success' : 'text-destructive';

  return (
    <div className="flex flex-col h-full border-l border-border">
      <div className="px-3 py-2 border-b border-border font-label text-xs text-muted-foreground uppercase tracking-widest">
        Vitals
      </div>
      <div className="flex-1 px-3 py-2">
        <Stat label="Status" value={state?.status || 'IDLE'} color={statusColors[state?.status || 'IDLE']} />
        <Stat label="Total Trades" value={state?.totalTrades?.toString() || '0'} />
        <Stat label="Win Rate" value={winRate} color={state && state.wins > state.losses ? 'text-success' : undefined} />
        <Stat label="P/L" value={state ? `$${state.currentProfit.toFixed(2)}` : '$0.00'} color={profitColor} />
        <Stat label="Harvested" value={state ? `$${state.harvestedProfit.toFixed(2)}` : '$0.00'} color="text-success" />
        <Stat label="Consec. Wins" value={state?.consecutiveWins?.toString() || '0'} />
        <Stat label="Stake" value={state ? `$${state.currentStake.toFixed(2)}` : '$0.00'} />
        <Stat label="Active Asset" value={state?.activeAsset || '—'} color="text-primary" />
        <Stat label="Recovery" value={state?.inRecovery ? 'ACTIVE' : 'OFF'} color={state?.inRecovery ? 'text-destructive' : undefined} />
        <Stat label="Cycle" value={state?.cycleCount?.toString() || '0'} />
      </div>

      {/* Emergency Stop */}
      {isRunning && (
        <div className="p-3 border-t border-border">
          <button
            onClick={emergencyStop}
            className="w-full py-3 font-label text-sm font-bold uppercase tracking-widest bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
          >
            ■ Emergency Stop
          </button>
        </div>
      )}
    </div>
  );
}
