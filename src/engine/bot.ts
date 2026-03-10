// ===== Trading Bot Core Engine =====
import {
  BotConfig,
  BotState,
  BotStatus,
  DigitData,
  LogEntry,
  MONITORED_ASSETS,
  AssetSymbol,
  TradeRecord,
  Prediction,
  ContractType,
  AccountInfo,
} from './types';
import { createDigitData, updateDigitData, extractLastDigit } from './analytics';
import { generatePredictions } from './prediction';
import { DerivWebSocket } from './websocket';

type StateListener = (state: BotState) => void;
type LogListener = (entry: LogEntry) => void;
type DigitListener = (symbol: string, data: DigitData) => void;
type TradeListener = (record: TradeRecord) => void;
type ArmedListener = (prediction: Prediction & { asset: string; countdown: number }) => void;
type BalanceListener = (balance: number) => void;

export class TradingBot {
  private config: BotConfig;
  private ws: DerivWebSocket | null = null;
  private digitData: Map<string, DigitData> = new Map();
  private state: BotState;
  private tradeLog: TradeRecord[] = [];
  private tradeCounter = 0;

  private stateListeners: StateListener[] = [];
  private logListeners: LogListener[] = [];
  private digitListeners: DigitListener[] = [];
  private tradeListeners: TradeListener[] = [];
  private armedListeners: ArmedListener[] = [];
  private balanceListeners: BalanceListener[] = [];
  private armedTimeout: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(config: BotConfig) {
    this.config = config;
    this.state = this.initialState();
    MONITORED_ASSETS.forEach(a => this.digitData.set(a.symbol, createDigitData()));
  }

  private initialState(): BotState {
    const shuffled = [...MONITORED_ASSETS].sort(() => Math.random() - 0.5);
    return {
      status: 'IDLE',
      totalTrades: 0,
      wins: 0,
      losses: 0,
      currentProfit: 0,
      harvestedProfit: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      currentStake: this.config.initialStake,
      activeAsset: null,
      inRecovery: false,
      cycleCount: 0,
      tradesInCurrentSymbol: 0,
      currentSymbolIndex: 0,
      shuffledSymbols: shuffled.slice(0, this.config.symbolsPerCycle),
      account: null,
      isTrading: false,
    };
  }

  // Event subscriptions
  onState(fn: StateListener) { this.stateListeners.push(fn); }
  onLog(fn: LogListener) { this.logListeners.push(fn); }
  onDigit(fn: DigitListener) { this.digitListeners.push(fn); }
  onTrade(fn: TradeListener) { this.tradeListeners.push(fn); }
  onArmed(fn: ArmedListener) { this.armedListeners.push(fn); }
  onBalance(fn: BalanceListener) { this.balanceListeners.push(fn); }

  private emitState() { this.stateListeners.forEach(fn => fn({ ...this.state })); }
  private emitLog(entry: LogEntry) { this.logListeners.forEach(fn => fn(entry)); }
  private emitDigit(symbol: string, data: DigitData) { this.digitListeners.forEach(fn => fn(symbol, { ...data })); }
  private emitTrade(record: TradeRecord) { this.tradeListeners.forEach(fn => fn(record)); }

  private log(asset: string, event: string, data: string, level: LogEntry['level'] = 'info') {
    const entry: LogEntry = { timestamp: Date.now(), asset, event, data, level };
    this.emitLog(entry);
  }

  private updateState(partial: Partial<BotState>) {
    this.state = { ...this.state, ...partial };
    this.emitState();
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.updateState({ status: 'MONITORING' });
    this.log('SYSTEM', 'INIT', 'Connecting to Deriv API...');

    try {
      this.ws = new DerivWebSocket(this.config.appId);
      await this.ws.connect();
      this.log('SYSTEM', 'CONNECTED', 'WebSocket connected');

      if (this.config.apiToken) {
        const authResult = await this.ws.authorize(this.config.apiToken);
        
        // Extract account info
        if (authResult.authorize) {
          const auth = authResult.authorize;
          const accountInfo: AccountInfo = {
            name: auth.fullname || auth.loginid || 'Unknown',
            loginid: auth.loginid || '',
            currency: auth.currency || 'USD',
            balance: parseFloat(auth.balance) || 0,
          };
          this.updateState({ account: accountInfo });
          this.log('SYSTEM', 'AUTHORIZED', `Account: ${accountInfo.name} | Balance: ${accountInfo.currency} ${accountInfo.balance.toFixed(2)}`);
        }

        // Subscribe to balance updates
        this.ws.on('balance', (data: any) => {
          if (data.balance) {
            const newBalance = parseFloat(data.balance.balance);
            const currency = data.balance.currency || 'USD';
            this.updateState({
              account: {
                ...this.state.account!,
                balance: newBalance,
                currency,
              }
            });
            this.balanceListeners.forEach(fn => fn(newBalance));
          }
        });
        this.ws.sendNoWait({ balance: 1, subscribe: 1 });
      }

      // Subscribe to all assets
      this.ws.on('tick', (data: any) => this.handleTick(data));

      for (const asset of MONITORED_ASSETS) {
        await this.ws.subscribeTicks(asset.symbol);
      }

      this.log('SYSTEM', 'SUBSCRIBED', `Monitoring ${MONITORED_ASSETS.length} assets`);
    } catch (err: any) {
      this.log('SYSTEM', 'ERROR', err.message, 'error');
      this.updateState({ status: 'STOPPED' });
    }
  }

  stop() {
    this.stopped = true;
    if (this.armedTimeout) {
      clearTimeout(this.armedTimeout);
      this.armedTimeout = null;
    }
    this.ws?.disconnect();
    this.updateState({ status: 'STOPPED' });
    this.log('SYSTEM', 'STOPPED', 'Bot stopped by operator');
  }

  emergencyStop() {
    this.stop();
    this.log('SYSTEM', 'EMERGENCY_STOP', 'Emergency stop triggered', 'error');
  }

  private handleTick(data: any) {
    if (this.stopped) return;
    const tick = data.tick;
    if (!tick) return;

    const symbol = tick.symbol;
    const price = parseFloat(tick.quote);

    // Update digit data
    let dd = this.digitData.get(symbol);
    if (!dd) return;
    dd = updateDigitData(dd, price);
    this.digitData.set(symbol, dd);
    this.emitDigit(symbol, dd);

    // Only evaluate if not currently in a trade
    if (!this.state.isTrading && (this.state.status === 'MONITORING' || this.state.status === 'IN_RECOVERY')) {
      this.evaluateTradeOpportunity();
    }
  }

  private evaluateTradeOpportunity() {
    if (this.stopped || this.state.isTrading) return;
    if (this.state.status !== 'MONITORING' && this.state.status !== 'IN_RECOVERY') return;

    // Check stopping conditions
    if (this.state.totalTrades >= this.config.maxTotalTrades) {
      this.log('SYSTEM', 'MAX_TRADES', `Reached ${this.config.maxTotalTrades} trades`, 'warn');
      this.stop();
      return;
    }
    if (this.state.consecutiveLosses >= this.config.maxConsecutiveLosses) {
      this.log('SYSTEM', 'CONSECUTIVE_LOSSES', `${this.state.consecutiveLosses} consecutive losses`, 'error');
      this.stop();
      return;
    }

    // Balance check
    if (this.state.account && this.state.account.balance < this.config.riskThresholdBalance) {
      this.log('SYSTEM', 'LOW_BALANCE', `Balance $${this.state.account.balance.toFixed(2)} below threshold $${this.config.riskThresholdBalance}`, 'error');
      this.stop();
      return;
    }

    // Get current cycle symbol
    const currentAsset = this.state.shuffledSymbols[this.state.currentSymbolIndex];
    if (!currentAsset) {
      this.rotateCycle();
      return;
    }

    const dd = this.digitData.get(currentAsset.symbol);
    if (!dd || dd.recentWindow.length < 30) return;

    const stake = this.state.currentStake;
    const predictions = generatePredictions(dd, stake, this.config.confidenceThreshold, this.config.tickDuration);

    if (predictions.length === 0) return;

    // Find best prediction across current cycle assets
    let bestPrediction = predictions[0];
    let bestAsset = currentAsset;

    for (const asset of this.state.shuffledSymbols) {
      if (asset.symbol === currentAsset.symbol) continue;
      const ad = this.digitData.get(asset.symbol);
      if (!ad || ad.recentWindow.length < 30) continue;
      const preds = generatePredictions(ad, stake, this.config.confidenceThreshold, this.config.tickDuration);
      if (preds.length > 0 && preds[0].expectedValue > bestPrediction.expectedValue) {
        bestPrediction = preds[0];
        bestAsset = asset;
      }
    }

    // In recovery, use a different contract category
    if (this.state.inRecovery) {
      const recoveryPred = predictions.find(p => {
        const cat = getContractCategory(p.contractType);
        const origCat = getContractCategory(bestPrediction.contractType);
        return cat !== origCat;
      });
      if (recoveryPred) bestPrediction = recoveryPred;
    }

    this.updateState({ activeAsset: bestAsset.name });
    this.armTrade(bestPrediction, bestAsset);
  }

  private armTrade(prediction: Prediction, asset: AssetSymbol) {
    this.updateState({ status: 'TRADE_ARMED', isTrading: true });
    this.log(asset.name, 'TRADE_ARMED', 
      `${prediction.contractType} d=${prediction.digit} conf=${(prediction.confidence * 100).toFixed(1)}% EV=${prediction.expectedValue.toFixed(4)} dur=${prediction.duration}t`,
      'trade'
    );

    this.armedListeners.forEach(fn => fn({
      ...prediction,
      asset: asset.name,
      countdown: 5,
    }));

    // DIGITDIFF: wait for target digit to appear
    if (prediction.contractType === 'DIGITDIFF') {
      this.log(asset.name, 'WAITING', `Waiting for digit ${prediction.digit} before entry`, 'info');
      const waitHandler = (data: any) => {
        if (this.stopped || this.state.status !== 'TRADE_ARMED') {
          this.ws?.off('tick', waitHandler);
          return;
        }
        const tick = data.tick;
        if (!tick || tick.symbol !== asset.symbol) return;
        const digit = extractLastDigit(parseFloat(tick.quote));
        if (digit === prediction.digit) {
          this.ws?.off('tick', waitHandler);
          this.executeTrade(prediction, asset);
        }
      };
      this.ws?.on('tick', waitHandler);
      this.armedTimeout = setTimeout(() => {
        this.ws?.off('tick', waitHandler);
        if (this.state.status === 'TRADE_ARMED') {
          this.log(asset.name, 'TIMEOUT', 'DIGITDIFF wait timeout, resuming monitoring', 'warn');
          this.updateState({ status: 'MONITORING', isTrading: false });
        }
      }, 30000);
      return;
    }

    // 5-second countdown for other types
    this.armedTimeout = setTimeout(() => {
      if (!this.stopped && this.state.status === 'TRADE_ARMED') {
        this.executeTrade(prediction, asset);
      }
    }, 5000);
  }

  private async executeTrade(prediction: Prediction, asset: AssetSymbol) {
    if (this.stopped) return;
    this.updateState({ status: 'EXECUTING', isTrading: true });

    const tradeRecord: TradeRecord = {
      id: ++this.tradeCounter,
      asset: asset.name,
      symbol: asset.symbol,
      contractType: prediction.contractType,
      barrier: prediction.digit,
      stake: this.state.currentStake,
      duration: prediction.duration,
      confidence: prediction.confidence,
      result: 'pending',
      profit: 0,
      timestamp: Date.now(),
    };

    this.log(asset.name, 'EXECUTING', 
      `#${tradeRecord.id} ${prediction.contractType} barrier=${prediction.digit} stake=$${this.state.currentStake.toFixed(2)} dur=${prediction.duration}t`,
      'trade'
    );

    try {
      if (this.ws && this.config.apiToken) {
        const barrier = prediction.contractType === 'DIGITEVEN' || prediction.contractType === 'DIGITODD'
          ? undefined
          : prediction.digit.toString();

        const result = await this.ws.buyContract({
          amount: this.state.currentStake,
          basis: 'stake',
          contract_type: prediction.contractType,
          currency: 'USD',
          duration: prediction.duration,
          duration_unit: 't',
          symbol: asset.symbol,
          barrier,
        });

        if (result.buy) {
          tradeRecord.contractId = result.buy.contract_id;
          this.log(asset.name, 'CONTRACT_BOUGHT', `ID: ${result.buy.contract_id}`, 'info');

          // Wait for settlement
          this.ws.sendNoWait({
            proposal_open_contract: 1,
            contract_id: result.buy.contract_id,
            subscribe: 1,
          });

          const settlementHandler = (data: any) => {
            const poc = data.proposal_open_contract;
            if (!poc || poc.contract_id?.toString() !== tradeRecord.contractId?.toString()) return;
            if (poc.is_sold) {
              this.ws?.off('proposal_open_contract', settlementHandler);
              const profit = parseFloat(poc.profit);
              tradeRecord.profit = profit;
              tradeRecord.result = profit >= 0 ? 'win' : 'loss';
              this.processTradeResult(tradeRecord);
            }
          };
          this.ws.on('proposal_open_contract', settlementHandler);
        }
      } else {
        // Demo mode: simulate result
        this.log(asset.name, 'DEMO_MODE', 'No API token, simulating trade', 'warn');
        const dd = this.digitData.get(asset.symbol);
        if (dd && dd.recentWindow.length > 0) {
          const lastDigit = dd.recentWindow[dd.recentWindow.length - 1];
          const won = this.simulateResult(prediction.contractType, prediction.digit, lastDigit);
          tradeRecord.result = won ? 'win' : 'loss';
          tradeRecord.profit = won ? this.state.currentStake * 0.95 : -this.state.currentStake;
          setTimeout(() => this.processTradeResult(tradeRecord), 2000);
        }
      }
    } catch (err: any) {
      this.log(asset.name, 'TRADE_ERROR', err.message, 'error');
      tradeRecord.result = 'loss';
      tradeRecord.profit = -this.state.currentStake;
      this.processTradeResult(tradeRecord);
    }
  }

  private simulateResult(contractType: ContractType, target: number, digit: number): boolean {
    const simDigit = Math.floor(Math.random() * 10);
    switch (contractType) {
      case 'DIGITOVER': return simDigit > target;
      case 'DIGITUNDER': return simDigit < target;
      case 'DIGITMATCH': return simDigit === target;
      case 'DIGITDIFF': return simDigit !== target;
      case 'DIGITEVEN': return simDigit % 2 === 0;
      case 'DIGITODD': return simDigit % 2 !== 0;
    }
  }

  private processTradeResult(record: TradeRecord) {
    this.tradeLog.push(record);
    this.emitTrade(record);

    const isWin = record.result === 'win';
    const newProfit = this.state.currentProfit + record.profit;

    if (isWin) {
      const newConsecWins = this.state.consecutiveWins + 1;
      let newStake = this.state.currentStake;
      let newHarvested = this.state.harvestedProfit;

      if (newConsecWins >= this.config.harvestAfterWins) {
        const harvestAmount = newStake - this.config.initialStake;
        if (harvestAmount > 0) {
          newHarvested += harvestAmount;
          this.log(record.asset, 'HARVEST', `Harvested $${harvestAmount.toFixed(2)}`, 'success');
        }
        newStake = this.config.initialStake;
      } else {
        newStake = this.config.initialStake + Math.max(0, newProfit - newHarvested);
      }

      this.log(record.asset, 'WIN',
        `#${record.id} ${record.contractType} on ${record.asset} → WIN +$${record.profit.toFixed(2)}`,
        'success'
      );

      this.updateState({
        totalTrades: this.state.totalTrades + 1,
        wins: this.state.wins + 1,
        currentProfit: newProfit,
        harvestedProfit: newHarvested,
        consecutiveWins: newConsecWins >= this.config.harvestAfterWins ? 0 : newConsecWins,
        consecutiveLosses: 0,
        currentStake: newStake,
        inRecovery: false,
        status: 'MONITORING',
        isTrading: false,
      });
    } else {
      this.log(record.asset, 'LOSS',
        `#${record.id} ${record.contractType} on ${record.asset} → LOSS -$${Math.abs(record.profit).toFixed(2)}`,
        'error'
      );

      if (this.state.inRecovery) {
        this.updateState({
          totalTrades: this.state.totalTrades + 1,
          losses: this.state.losses + 1,
          currentProfit: newProfit,
          consecutiveWins: 0,
          consecutiveLosses: this.state.consecutiveLosses + 1,
          status: 'STOPPED',
          inRecovery: false,
          isTrading: false,
        });
        this.log('SYSTEM', 'RECOVERY_FAILED', 'Recovery trade lost. Stopping.', 'error');
        this.stopped = true;
        return;
      }

      const recoveryStake = this.state.currentStake * this.config.recoveryMultiplier;
      this.updateState({
        totalTrades: this.state.totalTrades + 1,
        losses: this.state.losses + 1,
        currentProfit: newProfit,
        consecutiveWins: 0,
        consecutiveLosses: this.state.consecutiveLosses + 1,
        currentStake: recoveryStake,
        inRecovery: true,
        status: 'IN_RECOVERY',
        isTrading: false,
      });
      this.log('SYSTEM', 'RECOVERY_MODE', `Stake increased to $${recoveryStake.toFixed(2)}`, 'warn');
    }

    // Symbol rotation
    const newTradesInSymbol = this.state.tradesInCurrentSymbol + 1;
    if (newTradesInSymbol >= this.config.tradesPerSymbol) {
      this.updateState({ tradesInCurrentSymbol: 0, currentSymbolIndex: this.state.currentSymbolIndex + 1 });
      if (this.state.currentSymbolIndex >= this.state.shuffledSymbols.length) {
        this.rotateCycle();
      }
    } else {
      this.updateState({ tradesInCurrentSymbol: newTradesInSymbol });
    }
  }

  private rotateCycle() {
    const shuffled = [...MONITORED_ASSETS].sort(() => Math.random() - 0.5).slice(0, this.config.symbolsPerCycle);
    this.updateState({
      shuffledSymbols: shuffled,
      currentSymbolIndex: 0,
      cycleCount: this.state.cycleCount + 1,
    });
    this.log('SYSTEM', 'CYCLE_ROTATE', `New cycle: ${shuffled.map(s => s.name).join(', ')}`, 'info');
  }

  getState(): BotState { return { ...this.state }; }
  getTradeLog(): TradeRecord[] { return [...this.tradeLog]; }
  getDigitData(symbol: string): DigitData | undefined { return this.digitData.get(symbol); }
  getAllDigitData(): Map<string, DigitData> { return new Map(this.digitData); }
}

function getContractCategory(type: ContractType): string {
  if (type === 'DIGITOVER' || type === 'DIGITUNDER') return 'over_under';
  if (type === 'DIGITMATCH' || type === 'DIGITDIFF') return 'match_differ';
  return 'even_odd';
}
