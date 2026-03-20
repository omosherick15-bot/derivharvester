export const SYMBOLS_1S = [
  { symbol: '1HZ10V', name: 'Volatility 10 (1s) Index' },
  { symbol: '1HZ15V', name: 'Volatility 15 (1s) Index' },
  { symbol: '1HZ25V', name: 'Volatility 25 (1s) Index' },
  { symbol: '1HZ30V', name: 'Volatility 30 (1s) Index' },
  { symbol: '1HZ50V', name: 'Volatility 50 (1s) Index' },
  { symbol: '1HZ75V', name: 'Volatility 75 (1s) Index' },
  { symbol: '1HZ90V', name: 'Volatility 90 (1s) Index' },
  { symbol: '1HZ100V', name: 'Volatility 100 (1s) Index' },
];

export const SYMBOLS_STANDARD = [
  { symbol: 'R_10', name: 'Volatility 10 Index' },
  { symbol: 'R_25', name: 'Volatility 25 Index' },
  { symbol: 'R_50', name: 'Volatility 50 Index' },
  { symbol: 'R_75', name: 'Volatility 75 Index' },
  { symbol: 'R_100', name: 'Volatility 100 Index' },
];

export const ALL_SYMBOLS = [...SYMBOLS_1S, ...SYMBOLS_STANDARD];

export type ContractType = 'DIGITOVER' | 'DIGITUNDER' | 'DIGITMATCH' | 'DIGITDIFF' | 'DIGITEVEN' | 'DIGITODD' | 'CALL' | 'PUT';

export interface AccountInfo {
  name: string;
  loginid: string;
  currency: string;
  balance: number;
  email: string;
}

export interface SymbolData {
  symbol: string;
  name: string;
  digitCounts: number[];
  recentDigits: number[];
  recentWindow: number[];
  recentPrices: number[];
  lastPrice: string;
  tickCount: number;
}

export interface Prediction {
  symbol: string;
  symbolName: string;
  contractType: ContractType;
  digit: number;
  confidence: number;
  expectedValue: number;
  duration: number;
  source: string;
}

export interface TradeLog {
  id: number;
  symbol: string;
  symbolName: string;
  contractType: ContractType;
  digit: number;
  confidence: number;
  stake: number;
  duration: number;
  result: 'win' | 'loss' | 'pending';
  profitLoss: number;
  timestamp: Date;
  contractId?: number;
}

export interface TradingStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  sessionProfit: number;
  harvestedProfit: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  currentStake: number;
  isRecoveryMode: boolean;
  activeSymbol: string;
}

export type ContractCategory = 'over_under' | 'match_differ' | 'even_odd' | 'rise_fall';

export interface TradingConfig {
  initialStake: number;
  confidenceThreshold: number;
  tradesPerSymbol: number;
  symbolsPerCycle: number;
  maxConsecutiveWinsForHarvest: number;
  maxConsecutiveLosses: number;
  maxAutomatedTrades: number;
  recoveryMultiplier: number;
  enabledCategories: ContractCategory[];
  recoveryCategory: ContractCategory;
  autoPickDuration: boolean;
  manualDuration: number;
  ticksWindow: number;
  takeProfit: number;
  stopLoss: number;
  under4Over5Mode: boolean;
}

export const DEFAULT_CONFIG: TradingConfig = {
  initialStake: 0,
  confidenceThreshold: 0,
  tradesPerSymbol: 0,
  symbolsPerCycle: 0,
  maxConsecutiveWinsForHarvest: 0,
  maxConsecutiveLosses: 0,
  maxAutomatedTrades: 0,
  recoveryMultiplier: 0,
  enabledCategories: ['over_under', 'match_differ', 'even_odd', 'rise_fall'],
  recoveryCategory: 'rise_fall',
  autoPickDuration: true,
  manualDuration: 0,
  ticksWindow: 0,
  takeProfit: 0,
  stopLoss: 0,
  under4Over5Mode: false,
};

// Correct decimal places per Deriv symbol (from actual market data)
export const SYMBOL_DECIMALS: Record<string, number> = {
  // Volatility 1s indices
  'R_10_1S': 3,
  'R_15_1S': 3,
  'R_25_1S': 3,
  'R_30_1S': 3,
  'R_50_1S': 4,
  'R_75_1S': 4,
  'R_90_1S': 4,
  'R_100_1S': 2,
  // Standard Volatility indices
  'R_10': 3,
  'R_25': 3,
  'R_50': 4,
  'R_75': 4,
  'R_100': 2,
};

export function getContractTypesForCategories(categories: ContractCategory[]): ContractType[] {
  const types: ContractType[] = [];
  if (categories.includes('over_under')) types.push('DIGITOVER', 'DIGITUNDER');
  if (categories.includes('match_differ')) types.push('DIGITMATCH', 'DIGITDIFF');
  if (categories.includes('even_odd')) types.push('DIGITEVEN', 'DIGITODD');
  if (categories.includes('rise_fall')) types.push('CALL', 'PUT');
  return types;
}
