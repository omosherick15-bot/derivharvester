// ===== Terminal Dashboard =====
import { MarketColumn } from './MarketColumn';
import { LogColumn } from './LogColumn';
import { VitalsColumn } from './VitalsColumn';
import { useBotContext } from '../context/BotContext';

export function TerminalDashboard() {
  const { armed } = useBotContext();

  return (
    <div className={`h-screen w-screen grid grid-cols-[220px_1fr_240px] ${armed ? 'trade-armed-pulse' : ''}`}>
      <MarketColumn />
      <LogColumn />
      <VitalsColumn />
    </div>
  );
}
