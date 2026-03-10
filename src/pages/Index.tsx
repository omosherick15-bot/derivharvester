// ===== Main Index Page =====
import { useState } from 'react';
import { BotProvider, useBotContext } from '../context/BotContext';
import { ConfigScreen } from '../components/ConfigScreen';
import { TerminalDashboard } from '../components/TerminalDashboard';
import { BotConfig } from '../engine/types';

function AppContent() {
  const { isRunning, startBot, state } = useBotContext();
  const [configured, setConfigured] = useState(false);

  const handleStart = (config: BotConfig) => {
    startBot(config);
    setConfigured(true);
  };

  if (!configured) {
    return <ConfigScreen onStart={handleStart} />;
  }

  return <TerminalDashboard />;
}

const Index = () => {
  return (
    <BotProvider>
      <AppContent />
    </BotProvider>
  );
};

export default Index;
