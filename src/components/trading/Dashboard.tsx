import React, { useState, useCallback, useRef, useEffect } from 'react';
import { derivApi } from '@/lib/deriv-api';
import {
  AccountInfo, SymbolData, Prediction, TradeLog, TradingStats,
  TradingConfig, DEFAULT_CONFIG, ALL_SYMBOLS, ContractType, SYMBOL_DECIMALS,
  getContractTypesForCategories,
} from '@/lib/trading-types';
import { createSymbolData, updateSymbolData, generatePredictions, getBarrierString, getHMMFilter, resetHMMFilter, markRiseFallTrade } from '@/lib/trading-engine';
import { generateUnder4Over5Predictions } from '@/lib/under4over5-engine';
import { AccountPanel } from './AccountPanel';
import { StatsPanel } from './StatsPanel';
import { TradeLogPanel } from './TradeLogPanel';
import { PredictionPanel } from './PredictionPanel';
import { ControlPanel } from './ControlPanel';
import { DigitHeatmap } from './DigitHeatmap';
import { MarketAnalysisPanel } from './MarketAnalysisPanel';
import { LivePricesPanel } from './LivePricesPanel';
import { MarketScannerPanel } from './MarketScannerPanel';
import {
  soundTradeExecuted, soundTradeWin, soundTradeLoss,
  soundHarvest, soundSessionEnd, speakWelcome,
} from '@/lib/sounds';
import { sendTradingReport } from '@/lib/email-report';
import { toast } from 'sonner';

export const Dashboard: React.FC = () => {
  const [apiToken, setApiToken] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isTrading, setIsTrading] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [stats, setStats] = useState<TradingStats>({
    totalTrades: 0, wins: 0, losses: 0, winRate: 0,
    sessionProfit: 0, harvestedProfit: 0, consecutiveWins: 0,
    consecutiveLosses: 0, currentStake: DEFAULT_CONFIG.initialStake,
    isRecoveryMode: false, activeSymbol: '',
  });
  const [config, setConfig] = useState<TradingConfig>({ ...DEFAULT_CONFIG });
  const configRef = useRef(config);

  const handleConfigChange = useCallback((newConfig: TradingConfig) => {
    setConfig(newConfig);
    configRef.current = newConfig;
    setStats(prev => {
      if (!prev.isRecoveryMode && prev.consecutiveWins === 0) {
        return { ...prev, currentStake: Math.round(newConfig.initialStake * 100) / 100 };
      }
      return prev;
    });
  }, []);

  const [statusMessage, setStatusMessage] = useState('Disconnected');
  const [currentSymbolData, setCurrentSymbolData] = useState<SymbolData | null>(null);
  const [liveSymbolsData, setLiveSymbolsData] = useState<Map<string, SymbolData>>(new Map());
  const symbolCycleRef = useRef(0);

  const symbolsDataRef = useRef<Map<string, SymbolData>>(new Map());
  const isTradingRef = useRef(false);
  const statsRef = useRef(stats);
  const tradeCounterRef = useRef(0);
  const recentSymbolsRef = useRef<string[]>([]); // tracks last N symbols traded for cooldown
  const symbolTradeCountRef = useRef<Map<string, number>>(new Map()); // trades per symbol in current window
  const harvestWinCountRef = useRef(0);
  const initialBalanceRef = useRef(0);
  const peakHarvestedRef = useRef(0);

  useEffect(() => { statsRef.current = stats; }, [stats]);
  useEffect(() => { isTradingRef.current = isTrading; }, [isTrading]);

  const handleConnect = useCallback(async () => {
    if (!apiToken.trim()) return;
    try {
      setStatusMessage('Connecting...');
      await derivApi.connect(apiToken.trim());
      const accountInfo = await derivApi.authorize();
      setAccount(accountInfo);
      await derivApi.getBalance();
      setIsConnected(true);
      setStatusMessage('Connected - Subscribing to ticks...');

      // Welcome the user
      speakWelcome(accountInfo.name);

      derivApi.on('tick', (tick: any) => {
        if (!tick || !tick.symbol || tick.quote === undefined) return;
        const data = symbolsDataRef.current.get(tick.symbol);
        if (data) {
          // Use exact decimal places from SYMBOL_DECIMALS — authoritative source
          const decimals = SYMBOL_DECIMALS[tick.symbol] || 2;
          const ticksWin = configRef.current.ticksWindow || 50;
          const updated = updateSymbolData(data, tick.quote, decimals, ticksWin);
          symbolsDataRef.current.set(tick.symbol, updated);

          // Update HMM filter with the latest digit on every tick
          const lastDigit = updated.recentDigits[updated.recentDigits.length - 1];
          if (lastDigit !== undefined) {
            getHMMFilter().updateBelief(tick.symbol, lastDigit);
          }

          // Cycle display through symbols
          symbolCycleRef.current++;
          if (symbolCycleRef.current % 10 === 0) {
            setCurrentSymbolData({ ...updated });
          }
          // Update live prices on EVERY tick — zero lag
          const snapshot = new Map<string, SymbolData>();
          symbolsDataRef.current.forEach((v, k) => snapshot.set(k, { ...v }));
          setLiveSymbolsData(snapshot);
        }
      });

      // Initialize all symbol data first
      for (const sym of ALL_SYMBOLS) {
        symbolsDataRef.current.set(sym.symbol, createSymbolData(sym.symbol, sym.name));
      }

      // Stagger subscriptions with retry for reliability
      const failedSymbols: typeof ALL_SYMBOLS = [];
      for (let i = 0; i < ALL_SYMBOLS.length; i++) {
        const sym = ALL_SYMBOLS[i];
        try {
          await derivApi.subscribeTicks(sym.symbol);
          console.log(`✓ Subscribed to ${sym.symbol} (${sym.name})`);
        } catch (err) {
          console.error(`✗ Failed to subscribe to ${sym.symbol}:`, err);
          failedSymbols.push(sym);
        }
        if (i < ALL_SYMBOLS.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      // Retry failed subscriptions after a longer pause
      if (failedSymbols.length > 0) {
        console.log(`Retrying ${failedSymbols.length} failed subscriptions...`);
        await new Promise(r => setTimeout(r, 2000));
        for (const sym of failedSymbols) {
          try {
            await derivApi.subscribeTicks(sym.symbol);
            console.log(`✓ Retry succeeded for ${sym.symbol}`);
          } catch (err) {
            console.error(`✗ Retry failed for ${sym.symbol}:`, err);
          }
          await new Promise(r => setTimeout(r, 500));
        }
      }

      setStatusMessage('Connected - Ready to trade');
    } catch (err: any) {
      setStatusMessage(`Connection failed: ${err.message || err}`);
      console.error('Connection error:', err);
    }
  }, [apiToken]);

  const handleDisconnect = useCallback(() => {
    setIsTrading(false);
    derivApi.disconnect();
    setIsConnected(false);
    setAccount(null);
    setStatusMessage('Disconnected');
    symbolsDataRef.current.clear();
  }, []);

  const handleClearHistory = useCallback(() => {
    setTradeLogs([]);
    tradeCounterRef.current = 0;
  }, []);

  const resetSymbolTracking = useCallback(() => {
    recentSymbolsRef.current = [];
    symbolTradeCountRef.current = new Map();
  }, []);

  const stopTrading = useCallback((reason: string) => {
    setIsTrading(false);
    setStatusMessage(reason);
    soundSessionEnd();

    // Send email report
    const currentAccount = account;
    const currentStats = statsRef.current;
    if (currentAccount && currentStats.totalTrades > 0) {
      setStatusMessage(reason + ' — Sending email report...');
      setTradeLogs(currentLogs => {
        sendTradingReport({
          accountName: currentAccount.name,
          accountId: currentAccount.loginid,
          accountEmail: currentAccount.email,
          currency: currentAccount.currency,
          initialBalance: initialBalanceRef.current,
          finalBalance: currentAccount.balance,
          trades: currentLogs.filter(t => t.result !== 'pending'),
          stats: {
            totalTrades: currentStats.totalTrades,
            wins: currentStats.wins,
            losses: currentStats.losses,
            winRate: currentStats.winRate,
            sessionProfit: currentStats.sessionProfit,
            harvestedProfit: currentStats.harvestedProfit,
          },
        }).then(success => {
          if (success) {
            toast.success('Trading report sent to your email address');
            setStatusMessage(reason + ' — Report emailed ✓');
          } else {
            toast.error('Failed to send email report');
            setStatusMessage(reason + ' — Email report failed');
          }
        });
        return currentLogs;
      });
    }
  }, [account]);

  const executeTrade = useCallback(async (prediction: Prediction) => {
    if (!account || !isTradingRef.current) return;

    const currentStats = statsRef.current;
    const currentConfig = configRef.current;
    const stake = Math.round(currentStats.currentStake * 100) / 100;
    const tradeId = ++tradeCounterRef.current;

    const newLog: TradeLog = {
      id: tradeId,
      symbol: prediction.symbol,
      symbolName: prediction.symbolName,
      contractType: prediction.contractType,
      digit: prediction.digit,
      confidence: prediction.confidence,
      stake,
      duration: prediction.duration,
      result: 'pending',
      profitLoss: 0,
      timestamp: new Date(),
    };

    setTradeLogs(prev => [newLog, ...prev].slice(0, 100));
    setStats(prev => ({ ...prev, activeSymbol: prediction.symbolName }));
    setStatusMessage(`Trading: ${prediction.contractType} ${prediction.digit} on ${prediction.symbolName}`);
    soundTradeExecuted();

    // Mark cooldown for Rise/Fall trades
    if (prediction.contractType === 'CALL' || prediction.contractType === 'PUT') {
      const symData = symbolsDataRef.current.get(prediction.symbol);
      if (symData) markRiseFallTrade(prediction.symbol, symData.tickCount);
    }

    try {
      const barrier = getBarrierString(prediction.contractType, prediction.digit);
      const contractParams: any = {
        contractType: prediction.contractType,
        symbol: prediction.symbol,
        duration: prediction.duration,
        durationUnit: 't',
        barrier,
        amount: stake,
        currency: account.currency,
      };
      // Rise/Fall contracts don't use a barrier
      if (prediction.contractType === 'CALL' || prediction.contractType === 'PUT') {
        delete contractParams.barrier;
      }
      const buyResult = await derivApi.buyContract(contractParams);

      const contractId = buyResult.contract_id;
      newLog.contractId = contractId;

      const settled = await derivApi.waitForContractSettlement(contractId);
      
      // Use Deriv's actual status to determine win/loss — never guess from profit alone
      const profit = typeof settled.profit === 'number' ? settled.profit : (settled.sell_price - settled.buy_price) || 0;
      const won = settled.status === 'won' ? true : settled.status === 'lost' ? false : profit > 0;
      
      console.log(`Contract ${contractId} settled: status=${settled.status}, profit=${profit}, is_sold=${settled.is_sold}`);

      newLog.result = won ? 'win' : 'loss';
      newLog.profitLoss = profit;

      setTradeLogs(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(l => l.id === tradeId);
        if (idx >= 0) updated[idx] = { ...newLog };
        return updated;
      });

      setAccount(prev => prev ? { ...prev, balance: prev.balance + profit } : prev);

      if (won) {
        soundTradeWin();
      } else {
        soundTradeLoss();
      }

      setStats(prev => {
        const newStats = { ...prev };
        newStats.totalTrades++;
        newStats.sessionProfit += profit;

        if (won) {
          newStats.wins++;
          newStats.consecutiveWins++;
          newStats.consecutiveLosses = 0;
          newStats.isRecoveryMode = false;

          // Increment persistent harvest counter (survives recovery losses)
          harvestWinCountRef.current++;

          // Harvest check uses persistent counter
          if (harvestWinCountRef.current >= currentConfig.maxConsecutiveWinsForHarvest) {
            const harvestAmount = newStats.currentStake - currentConfig.initialStake;
            if (harvestAmount > 0) {
              newStats.harvestedProfit += harvestAmount;
            }
            // Always reset to user's initial stake after harvest
            newStats.currentStake = Math.round(currentConfig.initialStake * 100) / 100;
            newStats.consecutiveWins = 0;
            harvestWinCountRef.current = 0;
            soundHarvest();
          } else {
            newStats.currentStake = Math.round((newStats.currentStake + profit) * 100) / 100;
          }
        } else {
          newStats.losses++;
          newStats.consecutiveWins = 0;
          newStats.consecutiveLosses++;
          // Do NOT reset harvestWinCountRef — wins persist through recovery

          // Check consecutive loss limit
          if (newStats.consecutiveLosses >= currentConfig.maxConsecutiveLosses) {
            stopTrading(`Stopped: ${currentConfig.maxConsecutiveLosses} consecutive losses reached`);
          } else if (!prev.isRecoveryMode) {
            newStats.isRecoveryMode = true;
            newStats.currentStake = Math.round(stake * currentConfig.recoveryMultiplier * 100) / 100;
          } else {
            // Second loss in recovery - stop
            stopTrading('Stopped: Recovery trade lost');
          }
        }

        newStats.winRate = newStats.totalTrades > 0 ? (newStats.wins / newStats.totalTrades) * 100 : 0;

        if (newStats.totalTrades >= currentConfig.maxAutomatedTrades) {
          stopTrading(`Stopped: maximum of ${currentConfig.maxAutomatedTrades} automated trades reached`);
        }

        // Track peak harvested for stop loss
        if (newStats.harvestedProfit > peakHarvestedRef.current) {
          peakHarvestedRef.current = newStats.harvestedProfit;
        }

        // ── Take Profit check ──
        const resolvedTP = currentConfig.takeProfit || (currentConfig.initialStake || 0.35) * 5;
        if (newStats.sessionProfit >= resolvedTP) {
          stopTrading(`🎯 Take Profit reached: ${newStats.sessionProfit.toFixed(2)} ≥ ${resolvedTP.toFixed(2)}`);
        }

        // ── Stop Loss check ──
        const resolvedSL = currentConfig.stopLoss || 0.5;
        // Stop loss triggers when harvested profit drops by the SL amount from its peak
        if (peakHarvestedRef.current > 0 && (peakHarvestedRef.current - newStats.harvestedProfit) >= resolvedSL) {
          stopTrading(`🛑 Stop Loss triggered: harvested profit dropped by ${resolvedSL.toFixed(2)} from peak ${peakHarvestedRef.current.toFixed(2)}`);
        }
        // Also stop if session loss exceeds stop loss amount
        if (newStats.sessionProfit < 0 && Math.abs(newStats.sessionProfit) >= resolvedSL) {
          stopTrading(`🛑 Stop Loss triggered: session loss ${Math.abs(newStats.sessionProfit).toFixed(2)} ≥ ${resolvedSL.toFixed(2)}`);
        }

        return newStats;
      });

    } catch (err: any) {
      console.error('Trade error:', err);
      newLog.result = 'loss';
      setTradeLogs(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(l => l.id === tradeId);
        if (idx >= 0) updated[idx] = { ...newLog };
        return updated;
      });
      setStatusMessage(`Trade error: ${err.message || err}`);
    }
  }, [account, stopTrading]);

  // Resolve 0 values to sensible auto-defaults
  const resolveConfig = useCallback((cfg: TradingConfig): TradingConfig => ({
    ...cfg,
    initialStake: cfg.initialStake || 0.35,
    confidenceThreshold: cfg.confidenceThreshold || 60,
    tradesPerSymbol: cfg.tradesPerSymbol || 4,
    symbolsPerCycle: cfg.symbolsPerCycle || 4,
    maxConsecutiveWinsForHarvest: cfg.maxConsecutiveWinsForHarvest || 3,
    maxConsecutiveLosses: cfg.maxConsecutiveLosses || 3,
    maxAutomatedTrades: cfg.maxAutomatedTrades || 5,
    recoveryMultiplier: cfg.recoveryMultiplier || 1.5,
    manualDuration: cfg.manualDuration || 5,
    ticksWindow: cfg.ticksWindow || 50,
  }), []);

  const tradingLoop = useCallback(async () => {
    if (!isTradingRef.current) return;

    const currentConfig = resolveConfig(configRef.current);
    if (statsRef.current.totalTrades >= currentConfig.maxAutomatedTrades) {
      stopTrading(`Stopped: maximum of ${currentConfig.maxAutomatedTrades} automated trades reached`);
      return;
    }
    // Use Under4/Over5 engine when specialist mode is active
    const preds = currentConfig.under4Over5Mode
      ? generateUnder4Over5Predictions(symbolsDataRef.current, currentConfig)
      : generatePredictions(symbolsDataRef.current, currentConfig);
    setPredictions(preds);

    if (preds.length === 0) {
      setStatusMessage('Analyzing... No edge found yet');
      if (isTradingRef.current) {
        setTimeout(tradingLoop, 2000);
      }
      return;
    }

    // Filter predictions by symbol cooldown and trade limits
    const recentSymbols = recentSymbolsRef.current;
    const tradeCountMap = symbolTradeCountRef.current;
    const cooldownWindow = currentConfig.symbolsPerCycle;

    const cooldownSymbols = new Set(recentSymbols.slice(-(cooldownWindow - 1)));

    let bestPred = preds.find(p => {
      const count = tradeCountMap.get(p.symbol) || 0;
      const onCooldown = cooldownSymbols.has(p.symbol);
      return count < currentConfig.tradesPerSymbol && !onCooldown;
    }) || preds.find(p => {
      const count = tradeCountMap.get(p.symbol) || 0;
      return count < currentConfig.tradesPerSymbol;
    }) || preds[0];

    if (statsRef.current.isRecoveryMode) {
      const recoveryTypes = getContractTypesForCategories([currentConfig.recoveryCategory]);
      const recoveryPred = preds.find(p => recoveryTypes.includes(p.contractType));
      if (recoveryPred) bestPred = recoveryPred;
    }

    // For DIGITDIFF: wait until the target digit appears as current last digit
    if (bestPred.contractType === 'DIGITDIFF') {
      const symData = symbolsDataRef.current.get(bestPred.symbol);
      if (symData && symData.recentDigits.length > 0) {
        const currentLastDigit = symData.recentDigits[symData.recentDigits.length - 1];
        if (currentLastDigit !== bestPred.digit) {
          // Target digit hasn't appeared yet, wait and retry
          setStatusMessage(`Waiting for digit ${bestPred.digit} to appear on ${bestPred.symbolName} before DIFFER trade...`);
          if (isTradingRef.current) {
            setTimeout(tradingLoop, 500);
          }
          return;
        }
      }
    }

    await executeTrade(bestPred);

    const symCount = (tradeCountMap.get(bestPred.symbol) || 0) + 1;
    tradeCountMap.set(bestPred.symbol, symCount);

    if (symCount >= currentConfig.tradesPerSymbol) {
      recentSymbolsRef.current = [...recentSymbols, bestPred.symbol].slice(-20);
      tradeCountMap.delete(bestPred.symbol);
    }

    if (isTradingRef.current) {
      setTimeout(tradingLoop, 1500);
    }
  }, [executeTrade, resolveConfig]);

  const handleStartTrading = useCallback(() => {
    if (account) {
      initialBalanceRef.current = account.balance;
    }
    setIsTrading(true);
    setStats(prev => ({
      ...prev,
      currentStake: Math.round((configRef.current.initialStake || 0.35) * 100) / 100,
      isRecoveryMode: false,
      consecutiveWins: 0,
      consecutiveLosses: 0,
    }));
    setStatusMessage('Trading started...');
    resetSymbolTracking();
    resetHMMFilter();
    harvestWinCountRef.current = 0;
    peakHarvestedRef.current = 0;
    setTimeout(tradingLoop, 1000);
  }, [tradingLoop, resetSymbolTracking, account]);

  const handleStopTrading = useCallback(() => {
    stopTrading('Trading stopped');
  }, [stopTrading]);

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-3">
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="text-harvest">⚡</span> Advanced Harvest Trader
            </h1>
            <p className="text-lg font-medium text-foreground">
              Your AI-Powered Trading Edge on{' '}
              <span className="font-bold" style={{ color: '#FF444F' }}>deriv</span>
            </p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Let the bot scan 13 volatility markets in real-time, detect hidden patterns, and execute precision trades — directly in your{' '}
              <span className="font-semibold" style={{ color: '#FF444F' }}>deriv</span> account.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                <span style={{ color: '#FF444F' }}>deriv</span> API Token
              </label>
              <input
                type="password"
                value={apiToken}
                onChange={e => setApiToken(e.target.value)}
                placeholder="Enter your Deriv API token"
                className="w-full rounded-md bg-secondary px-3 py-2 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Get your token from <span style={{ color: '#FF444F' }}>deriv</span> → Settings → API Token (enable Trade scope)
              </p>
            </div>
            <button
              onClick={handleConnect}
              disabled={!apiToken.trim()}
              className="w-full rounded-md bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              🚀 Connect & Start Trading
            </button>
            <p className="text-xs text-center text-muted-foreground">{statusMessage}</p>
          </div>

          {/* Disclaimer */}
          <div className="rounded-lg border border-harvest/30 bg-harvest/5 p-4 space-y-2">
            <p className="text-xs font-semibold text-harvest text-center">⚠️ BETA — Testing Phase</p>
            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              This bot is currently in <span className="font-semibold text-foreground">active development and testing</span>. 
              Please use it with your <span className="font-semibold" style={{ color: '#FF444F' }}>deriv</span>{' '}
              <span className="font-semibold text-foreground">demo account</span> first to evaluate its performance before risking real funds.
            </p>
            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              We welcome your feedback! If you encounter issues or have suggestions for improvement, please reach out so we can make the bot better for everyone.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-4 py-2 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-harvest font-bold text-lg">⚡</span>
          <h1 className="text-sm font-bold md:text-base">Advanced Harvest Trader</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-block w-2 h-2 rounded-full ${isTrading ? 'bg-profit animate-pulse-profit' : 'bg-muted-foreground'}`} />
          <span className="text-xs text-muted-foreground">{statusMessage}</span>
          <button
            onClick={handleDisconnect}
            className="text-xs text-destructive hover:underline ml-2"
          >
            Disconnect from Deriv Account
          </button>
        </div>
      </header>

      <div className="flex-1 p-2 md:p-4 grid grid-cols-1 lg:grid-cols-12 gap-2 md:gap-4 overflow-hidden">
        <div className="lg:col-span-3 space-y-2 md:space-y-4">
          <AccountPanel account={account} />
          <StatsPanel stats={stats} />
          <ControlPanel
            isTrading={isTrading}
            onStart={handleStartTrading}
            onStop={handleStopTrading}
            config={config}
            onConfigChange={handleConfigChange}
          />
        </div>

        <div className="lg:col-span-5 space-y-2 md:space-y-4">
          <LivePricesPanel symbolsData={liveSymbolsData} />
          <PredictionPanel predictions={predictions} isTrading={isTrading} symbolsData={liveSymbolsData} />
          {currentSymbolData && currentSymbolData.recentDigits.length >= 10 && (
            <div className="space-y-2">
              <DigitHeatmap data={currentSymbolData} />
              <MarketAnalysisPanel data={currentSymbolData} ticksWindow={config.ticksWindow} />
            </div>
          )}
        </div>

        <div className="lg:col-span-4">
          <TradeLogPanel logs={tradeLogs} onClearHistory={handleClearHistory} />
        </div>
      </div>
    </div>
  );
};
