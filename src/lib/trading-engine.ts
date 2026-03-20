import {
  SymbolData, Prediction, ContractType, TradingConfig,
  ALL_SYMBOLS, DEFAULT_CONFIG, SYMBOL_DECIMALS, getContractTypesForCategories,
} from './trading-types';
import { AlphaBetaHMMFilter, HMMFilterState } from './hmm-filter';
import { predictRiseFall, markRiseFallTrade, resetRiseFallCooldowns } from './rise-fall-engine';

export function createSymbolData(symbol: string, name: string): SymbolData {
  return {
    symbol, name,
    digitCounts: new Array(10).fill(0),
    recentDigits: [],
    recentWindow: [],
    recentPrices: [],
    lastPrice: '',
    tickCount: 0,
  };
}

export function updateSymbolData(data: SymbolData, quote: number, decimals: number = 2, ticksWindow: number = 50): SymbolData {
  // Format with correct decimal places to preserve trailing zeros (e.g. 1234.50 → "1234.50")
  const price = quote.toFixed(decimals);
  const lastChar = price.slice(-1);
  const digit = parseInt(lastChar, 10);
  if (isNaN(digit)) return data;

  const newDigits = [...data.recentDigits, digit].slice(-200);
  const newCounts = [...data.digitCounts];
  newCounts[digit]++;
  const newPrices = [...(data.recentPrices || []), quote].slice(-200);

  return {
    ...data,
    lastPrice: price,
    tickCount: data.tickCount + 1,
    digitCounts: newCounts,
    recentDigits: newDigits,
    recentWindow: newDigits.slice(-(ticksWindow || 50)),
    recentPrices: newPrices,
  };
}

// Shannon entropy
function shannonEntropy(frequencies: number[]): number {
  const total = frequencies.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let entropy = 0;
  for (const f of frequencies) {
    if (f === 0) continue;
    const p = f / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// Digit frequency from window
function digitFrequencies(window: number[]): number[] {
  const freq = new Array(10).fill(0);
  for (const d of window) freq[d]++;
  return freq;
}

// Markov transition probabilities
function markovProbabilities(digits: number[]): number[][] {
  const trans = Array.from({ length: 10 }, () => new Array(10).fill(0));
  for (let i = 0; i < digits.length - 1; i++) {
    trans[digits[i]][digits[i + 1]]++;
  }
  // Normalize
  return trans.map(row => {
    const sum = row.reduce((a: number, b: number) => a + b, 0);
    return sum > 0 ? row.map((v: number) => v / sum) : row.map(() => 0.1);
  });
}

// Detect cycles
function detectCycles(digits: number[]): Map<string, number> {
  const cycles = new Map<string, number>();
  for (let len = 2; len <= 5; len++) {
    for (let i = 0; i <= digits.length - len; i++) {
      const seq = digits.slice(i, i + len).join(',');
      cycles.set(seq, (cycles.get(seq) || 0) + 1);
    }
  }
  // Keep only cycles appearing 3+
  const filtered = new Map<string, number>();
  cycles.forEach((count, seq) => {
    if (count >= 3) filtered.set(seq, count);
  });
  return filtered;
}

// Volatility filter
function tickVariance(digits: number[]): number {
  if (digits.length < 2) return 0;
  const mean = digits.reduce((a, b) => a + b, 0) / digits.length;
  return digits.reduce((sum, d) => sum + (d - mean) ** 2, 0) / digits.length;
}

// Simulate duration to find best win rate
function simulateDuration(digits: number[], contractType: ContractType, target: number): { bestDuration: number; bestWinRate: number } {
  let bestDuration = 1;
  let bestWinRate = 0;

  for (let dur = 1; dur <= Math.min(10, digits.length - 1); dur++) {
    let wins = 0;
    let total = 0;
    for (let i = 0; i <= digits.length - dur - 1; i++) {
      const resultDigit = digits[i + dur];
      const won = checkWin(contractType, target, resultDigit);
      if (won) wins++;
      total++;
    }
    const wr = total > 0 ? wins / total : 0;
    if (wr > bestWinRate) {
      bestWinRate = wr;
      bestDuration = dur;
    }
  }
  return { bestDuration, bestWinRate };
}

function checkWin(contractType: ContractType, target: number, result: number): boolean {
  switch (contractType) {
    case 'DIGITOVER': return result > target;
    case 'DIGITUNDER': return result < target;
    case 'DIGITMATCH': return result === target;
    case 'DIGITDIFF': return result !== target;
    case 'DIGITEVEN': return result % 2 === 0;
    case 'DIGITODD': return result % 2 !== 0;
    case 'CALL': return result > 0; // rise
    case 'PUT': return result < 0;  // fall
  }
}

function getPayoutMultiplier(contractType: ContractType): number {
  switch (contractType) {
    case 'DIGITMATCH': return 9.0;
    case 'DIGITDIFF': return 0.11;
    case 'DIGITOVER':
    case 'DIGITUNDER': return 1.0;
    case 'DIGITEVEN':
    case 'DIGITODD': return 0.95;
    case 'CALL':
    case 'PUT': return 0.95;
  }
}

// Singleton HMM filter instance shared across prediction cycles
let hmmFilter: AlphaBetaHMMFilter | null = null;

export function getHMMFilter(): AlphaBetaHMMFilter {
  if (!hmmFilter) hmmFilter = new AlphaBetaHMMFilter();
  return hmmFilter;
}

export function resetHMMFilter(): void {
  hmmFilter = null;
  resetRiseFallCooldowns();
}

export function generatePredictions(symbolsData: Map<string, SymbolData>, config: TradingConfig): Prediction[] {
  const predictions: Prediction[] = [];
  const hmm = getHMMFilter();

  symbolsData.forEach((data) => {
    if (data.recentWindow.length < 30) return;

    // Initialize / update HMM filter from the full digit history
    const hmmState = hmm.initializeFromHistory(data.symbol, data.recentDigits);

    const freq = digitFrequencies(data.recentWindow);
    const entropy = shannonEntropy(freq);
    const uniformEntropy = Math.log2(10); // ~3.32
    const variance = tickVariance(data.recentWindow);

    // Skip if entropy is too uniform (no edge) or variance too extreme
    if (entropy > uniformEntropy * 0.99) return;
    if (variance < 0.8 || variance > 16) return;

    const markov = markovProbabilities(data.recentWindow);
    const currentDigit = data.recentWindow[data.recentWindow.length - 1];
    const total = data.recentWindow.length;

    // Evaluate each contract type
    const contractTypes = getContractTypesForCategories(config.enabledCategories);

    for (const ct of contractTypes) {
      const targets = ct === 'DIGITEVEN' || ct === 'DIGITODD' ? [0] : Array.from({ length: 10 }, (_, i) => i);

      for (const target of targets) {
        // Skip trivial/near-guaranteed targets
        if (ct === 'DIGITOVER' && (target <= 1 || target >= 8)) continue;
        if (ct === 'DIGITUNDER' && (target <= 1 || target >= 8)) continue;

        // ── HMM Confluence Gate for EVEN/ODD ──
        // Only allow EVEN/ODD trades when the Alpha-Beta HMM filter agrees
        if (ct === 'DIGITEVEN') {
          if (hmmState.prediction !== 'EVEN') continue; // HMM must confirm EVEN regime
        }
        if (ct === 'DIGITODD') {
          if (hmmState.prediction !== 'ODD') continue;  // HMM must confirm ODD regime
        }

        // Calculate win probability from heat map
        let heatProb = 0;
        if (ct === 'DIGITOVER') {
          heatProb = freq.slice(target + 1).reduce((a, b) => a + b, 0) / total;
        } else if (ct === 'DIGITUNDER') {
          heatProb = freq.slice(0, target).reduce((a, b) => a + b, 0) / total;
        } else if (ct === 'DIGITMATCH') {
          heatProb = freq[target] / total;
        } else if (ct === 'DIGITDIFF') {
          heatProb = (total - freq[target]) / total;
        } else if (ct === 'DIGITEVEN') {
          heatProb = [0,2,4,6,8].reduce((s, d) => s + freq[d], 0) / total;
        } else {
          heatProb = [1,3,5,7,9].reduce((s, d) => s + freq[d], 0) / total;
        }

        // Markov probability
        let markovProb = heatProb;
        if (ct === 'DIGITOVER') {
          markovProb = markov[currentDigit].slice(target + 1).reduce((a, b) => a + b, 0);
        } else if (ct === 'DIGITUNDER') {
          markovProb = markov[currentDigit].slice(0, target).reduce((a, b) => a + b, 0);
        } else if (ct === 'DIGITMATCH') {
          markovProb = markov[currentDigit][target];
        } else if (ct === 'DIGITDIFF') {
          markovProb = 1 - markov[currentDigit][target];
        } else if (ct === 'DIGITEVEN') {
          markovProb = [0,2,4,6,8].reduce((s, d) => s + markov[currentDigit][d], 0);
        } else {
          markovProb = [1,3,5,7,9].reduce((s, d) => s + markov[currentDigit][d], 0);
        }

        // Combined confidence — boost EVEN/ODD when HMM agrees strongly
        let confidence = (heatProb * 0.5 + markovProb * 0.5) * 100;
        let hmmSource = '';

        if (ct === 'DIGITEVEN' || ct === 'DIGITODD') {
          // HMM confluence bonus: blend HMM confidence into the score
          const hmmBoost = Math.min(hmmState.confidence * 5, 15); // up to +15% confidence boost
          confidence += hmmBoost;
          hmmSource = ` HMM:${hmmState.signalStrength}(L=${hmmState.belief.toFixed(2)})`;
        }

        if (confidence < config.confidenceThreshold) continue;

        const payout = getPayoutMultiplier(ct);
        const winProb = Math.min(confidence / 100, 0.99); // cap at 99%
        const ev = (winProb * payout * config.initialStake) - ((1 - winProb) * config.initialStake);
        if (ev <= 0) continue;

        // Duration selection
        let duration = config.autoPickDuration ? 5 : config.manualDuration;
        if (config.autoPickDuration) {
          const { bestDuration, bestWinRate } = simulateDuration(data.recentWindow, ct, target);
          if (bestWinRate < config.confidenceThreshold / 100) continue;
          duration = bestDuration;
        }

        predictions.push({
          symbol: data.symbol,
          symbolName: data.name,
          contractType: ct,
          digit: target,
          confidence: Math.round(confidence * 10) / 10,
          expectedValue: Math.round(ev * 1000) / 1000,
          duration,
          source: `Heat:${(heatProb * 100).toFixed(0)}% Markov:${(markovProb * 100).toFixed(0)}%${hmmSource}`,
        });
      }
    }
  });

  // ── Rise/Fall Ensemble Predictions ──
  if (getContractTypesForCategories(config.enabledCategories).includes('CALL')) {
    symbolsData.forEach((data) => {
      if (!data.recentPrices || data.recentPrices.length < 30) return;

      const hmm = getHMMFilter();
      const hmmState = hmm.getState(data.symbol);

      const signal = predictRiseFall(
        data.symbol,
        data.recentPrices,
        data.tickCount,
        hmmState.belief,
        config.confidenceThreshold
      );

      if (signal.cooldownActive || !signal.direction) return;

      const ct: ContractType = signal.direction === 'RISE' ? 'CALL' : 'PUT';
      const payout = getPayoutMultiplier(ct);
      const winProb = Math.max(signal.pRise, signal.pFall);
      const ev = (winProb * payout * config.initialStake) - ((1 - winProb) * config.initialStake);
      if (ev <= 0) return;

      // Duration: 5 ticks for rise/fall
      const duration = config.autoPickDuration ? 5 : (config.manualDuration || 5);

      predictions.push({
        symbol: data.symbol,
        symbolName: data.name,
        contractType: ct,
        digit: 0,
        confidence: Math.round(signal.confidence * 10) / 10,
        expectedValue: Math.round(ev * 1000) / 1000,
        duration,
        source: signal.source,
      });
    });
  }

  // Sort by EV descending, take best
  predictions.sort((a, b) => b.expectedValue - a.expectedValue);
  return predictions.slice(0, 10);
}

export function getBarrierString(contractType: ContractType, digit: number): string {
  switch (contractType) {
    case 'DIGITOVER':
    case 'DIGITUNDER':
    case 'DIGITMATCH':
    case 'DIGITDIFF':
      return digit.toString();
    case 'DIGITEVEN':
    case 'DIGITODD':
      return '0';
    case 'CALL':
    case 'PUT':
      return ''; // Rise/Fall uses no barrier
  }
}

export { markRiseFallTrade };
