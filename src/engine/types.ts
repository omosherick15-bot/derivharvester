// ===== Core Types for Advanced Harvest Trader =====

export interface BotConfig {
  initialStake: number;
  recoveryMultiplier: number;
  tickDuration: number | null; // null = auto-select
  tradesPerSymbol: number;
  symbolsPerCycle: number;
  harvestAfterWins: number;
  maxTotalTrades: number;
  maxConsecutiveLosses: number;
  riskThresholdBalance: number;
  confidenceThreshold: number; // default 0.6
  appId: number;
  apiToken: string;
}

export const DEFAULT_CONFIG: BotConfig = {
  initialStake: 0.35,
  recoveryMultiplier: 1.5,
  tickDuration: null,
  tradesPerSymbol: 4,
  symbolsPerCycle: 4,
  harvestAfterWins: 3,
  maxTotalTrades: 100,
  maxConsecutiveLosses: 2,
  riskThresholdBalance: 5,
  confidenceThreshold: 0.6,
  appId: 1089,
  apiToken: '',
};

export type ContractType = 'DIGITOVER' | 'DIGITUNDER' | 'DIGITMATCH' | 'DIGITDIFF' | 'DIGITEVEN' | 'DIGITODD';

export type ContractCategory = 'over_under' | 'match_differ' | 'even_odd';

export interface AssetSymbol {
  name: string;
  symbol: string;
}

export const MONITORED_ASSETS: AssetSymbol[] = [
  { name: 'V10 (1s)', symbol: '1HZ10V' },
  { name: 'V15 (1s)', symbol: '1HZ15V' },
  { name: 'V25 (1s)', symbol: '1HZ25V' },
  { name: 'V30 (1s)', symbol: '1HZ30V' },
  { name: 'V50 (1s)', symbol: '1HZ50V' },
  { name: 'V75 (1s)', symbol: '1HZ75V' },
  { name: 'V90 (1s)', symbol: '1HZ90V' },
  { name: 'V100 (1s)', symbol: '1HZ100V' },
  { name: 'V10', symbol: 'R_10' },
  { name: 'V25', symbol: 'R_25' },
  { name: 'V50', symbol: 'R_50' },
  { name: 'V75', symbol: 'R_75' },
  { name: 'V100', symbol: 'R_100' },
];

export interface DigitData {
  digitCounts: number[]; // [0..9]
  recentDigits: number[]; // last 200
  recentWindow: number[]; // last 50
  lastTick: number;
  sparkline: number[]; // last 5 ticks raw
}

export interface Prediction {
  contractType: ContractType;
  digit: number;
  confidence: number;
  expectedValue: number;
  duration: number;
  source: string;
}

export interface TradeRecord {
  id: number;
  asset: string;
  symbol: string;
  contractType: ContractType;
  barrier: number;
  stake: number;
  duration: number;
  confidence: number;
  result: 'win' | 'loss' | 'pending';
  profit: number;
  timestamp: number;
  contractId?: string;
}

export type BotStatus = 'IDLE' | 'CONFIGURING' | 'MONITORING' | 'TRADE_ARMED' | 'EXECUTING' | 'IN_RECOVERY' | 'STOPPED';

export interface AccountInfo {
  name: string;
  loginid: string;
  currency: string;
  balance: number;
}

export interface BotState {
  status: BotStatus;
  totalTrades: number;
  wins: number;
  losses: number;
  currentProfit: number;
  harvestedProfit: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  currentStake: number;
  activeAsset: string | null;
  inRecovery: boolean;
  cycleCount: number;
  tradesInCurrentSymbol: number;
  currentSymbolIndex: number;
  shuffledSymbols: AssetSymbol[];
  account: AccountInfo | null;
  isTrading: boolean; // true when a trade is in progress
}

export interface LogEntry {
  timestamp: number;
  asset: string;
  event: string;
  data: string;
  level: 'info' | 'trade' | 'warn' | 'error' | 'success';
}
