// ===== Right Column: Vitals HUD =====
import { useBotContext } from '../context/BotContext';

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-border/50">
      <span className="font-label text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`font-mono text-sm font-semibold ${color || 'text-foreground'}`}>{value}</span>
    </div>
  );
}

const statusColors: Record<string, string> = {
  IDLE: 'text-muted-foreground',
  CONFIGURING: 'text-muted-foreground',
  MONITORING: 'text-primary',
  TRADE_ARMED: 'text-accent',
  EXECUTING: 'text-accent',
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
      {/* Account Info */}
      {state?.account && (
        <div className="px-3 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="font-label text-[10px] text-muted-foreground uppercase tracking-widest">Connected</span>
          </div>
          <div className="font-mono text-sm text-foreground font-semibold truncate">{state.account.name}</div>
          <div className="font-label text-[10px] text-muted-foreground">{state.account.loginid}</div>
          <div className="mt-2 px-3 py-2 rounded bg-secondary border border-border">
            <div className="font-label text-[10px] text-muted-foreground uppercase">Balance</div>
            <div className="font-mono text-lg font-bold text-primary">
              {state.account.currency} {state.account.balance.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      <div className="px-3 py-2 border-b border-border font-label text-[10px] text-muted-foreground uppercase tracking-widest">
        Vitals
      </div>
      <div className="flex-1 px-3 py-2 overflow-y-auto">
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
        {state?.isTrading && (
          <div className="mt-2 py-1.5 text-center">
            <span className="font-label text-[10px] uppercase tracking-widest text-accent animate-pulse">● Trade in progress...</span>
          </div>
        )}
      </div>

      {/* Emergency Stop */}
      {isRunning && (
        <div className="p-3 border-t border-border">
          <button
            onClick={emergencyStop}
            className="w-full py-3 rounded font-label text-sm font-bold uppercase tracking-widest bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
          >
            ■ Emergency Stop
          </button>
        </div>
      )}
    </div>
  );
}
