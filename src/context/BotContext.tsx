// ===== React context for the trading bot =====
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { TradingBot } from '../engine/bot';
import { BotConfig, BotState, LogEntry, DigitData, TradeRecord, Prediction, DEFAULT_CONFIG } from '../engine/types';

interface BotContextType {
  bot: TradingBot | null;
  state: BotState | null;
  logs: LogEntry[];
  digitDataMap: Map<string, DigitData>;
  trades: TradeRecord[];
  armed: (Prediction & { asset: string; countdown: number }) | null;
  isRunning: boolean;
  startBot: (config: BotConfig) => void;
  stopBot: () => void;
  emergencyStop: () => void;
}

const BotContext = createContext<BotContextType | null>(null);

export function useBotContext() {
  const ctx = useContext(BotContext);
  if (!ctx) throw new Error('useBotContext must be used within BotProvider');
  return ctx;
}

export function BotProvider({ children }: { children: React.ReactNode }) {
  const botRef = useRef<TradingBot | null>(null);
  const [state, setState] = useState<BotState | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [digitDataMap, setDigitDataMap] = useState<Map<string, DigitData>>(new Map());
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [armed, setArmed] = useState<(Prediction & { asset: string; countdown: number }) | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const startBot = useCallback((config: BotConfig) => {
    const bot = new TradingBot(config);
    botRef.current = bot;

    bot.onState((s) => setState({ ...s }));
    bot.onLog((entry) => setLogs(prev => [entry, ...prev].slice(0, 500)));
    bot.onDigit((symbol, data) => {
      setDigitDataMap(prev => {
        const next = new Map(prev);
        next.set(symbol, data);
        return next;
      });
    });
    bot.onTrade((record) => setTrades(prev => [record, ...prev]));
    bot.onArmed((pred) => {
      setArmed(pred);
      setTimeout(() => setArmed(null), 5500);
    });

    bot.start();
    setIsRunning(true);
  }, []);

  const stopBot = useCallback(() => {
    botRef.current?.stop();
    setIsRunning(false);
  }, []);

  const emergencyStop = useCallback(() => {
    botRef.current?.emergencyStop();
    setIsRunning(false);
    setArmed(null);
  }, []);

  return (
    <BotContext.Provider value={{
      bot: botRef.current,
      state,
      logs,
      digitDataMap,
      trades,
      armed,
      isRunning,
      startBot,
      stopBot,
      emergencyStop,
    }}>
      {children}
    </BotContext.Provider>
  );
}
