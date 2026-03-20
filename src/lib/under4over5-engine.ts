/**
 * Under 4 / Over 5 Specialized Prediction Engine
 * 
 * 6-Layer Analysis System:
 * 1. Frequency Dominance Analysis — digit distribution bias detection
 * 2. Run-Length Streak Analysis — streak persistence patterns  
 * 3. Markov Conditional Probability — transition matrix targeting
 * 4. Entropy Regime Detection — low-entropy exploitation windows
 * 5. Weighted Recency Model — exponential decay emphasizing recent ticks
 * 6. Autocorrelation Lag Analysis — serial dependency detection
 * 
 * Only produces DIGITUNDER 4 or DIGITOVER 5 predictions.
 */

import { SymbolData, Prediction, TradingConfig, SYMBOL_DECIMALS } from './trading-types';

// ─── Layer 1: Frequency Dominance ──────────────────────────────────

function frequencyDominance(window: number[]): { underProb: number; overProb: number } {
  const total = window.length;
  if (total === 0) return { underProb: 0.4, overProb: 0.5 };

  // Under 4 means digits 0,1,2,3 — Over 5 means digits 6,7,8,9
  const underCount = window.filter(d => d < 4).length;
  const overCount = window.filter(d => d > 5).length;

  return {
    underProb: underCount / total,
    overProb: overCount / total,
  };
}

// ─── Layer 2: Run-Length Streak Analysis ────────────────────────────

function streakAnalysis(window: number[]): { underStreak: number; overStreak: number; underStreakAvg: number; overStreakAvg: number } {
  let currentUnderStreak = 0;
  let currentOverStreak = 0;
  const underStreaks: number[] = [];
  const overStreaks: number[] = [];

  for (const d of window) {
    if (d < 4) {
      currentUnderStreak++;
      if (currentOverStreak > 0) { overStreaks.push(currentOverStreak); currentOverStreak = 0; }
    } else if (d > 5) {
      currentOverStreak++;
      if (currentUnderStreak > 0) { underStreaks.push(currentUnderStreak); currentUnderStreak = 0; }
    } else {
      if (currentUnderStreak > 0) underStreaks.push(currentUnderStreak);
      if (currentOverStreak > 0) overStreaks.push(currentOverStreak);
      currentUnderStreak = 0;
      currentOverStreak = 0;
    }
  }
  if (currentUnderStreak > 0) underStreaks.push(currentUnderStreak);
  if (currentOverStreak > 0) overStreaks.push(currentOverStreak);

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return {
    underStreak: currentUnderStreak,
    overStreak: currentOverStreak,
    underStreakAvg: avg(underStreaks),
    overStreakAvg: avg(overStreaks),
  };
}

// ─── Layer 3: Markov Conditional Probability ───────────────────────

function markovConditional(window: number[]): { pUnder: number; pOver: number } {
  if (window.length < 5) return { pUnder: 0.4, pOver: 0.4 };

  const last = window[window.length - 1];
  
  // Build transition counts from current digit to under(<4) or over(>5)
  let fromCurrentToUnder = 0;
  let fromCurrentToOver = 0;
  let fromCurrentTotal = 0;

  for (let i = 0; i < window.length - 1; i++) {
    if (window[i] === last) {
      fromCurrentTotal++;
      if (window[i + 1] < 4) fromCurrentToUnder++;
      if (window[i + 1] > 5) fromCurrentToOver++;
    }
  }

  if (fromCurrentTotal < 3) return { pUnder: 0.4, pOver: 0.4 };

  return {
    pUnder: fromCurrentToUnder / fromCurrentTotal,
    pOver: fromCurrentToOver / fromCurrentTotal,
  };
}

// ─── Layer 4: Entropy Regime Detection ─────────────────────────────

function entropyRegime(window: number[]): { entropyScore: number; isLowEntropy: boolean } {
  const total = window.length;
  if (total === 0) return { entropyScore: 0, isLowEntropy: false };

  // Binary entropy: under(<4) vs not-under, and over(>5) vs not-over
  const freq = new Array(10).fill(0);
  for (const d of window) freq[d]++;

  let entropy = 0;
  for (const f of freq) {
    if (f === 0) continue;
    const p = f / total;
    entropy -= p * Math.log2(p);
  }

  const uniformEntropy = Math.log2(10); // ~3.322
  const normalizedEntropy = entropy / uniformEntropy;

  // Low entropy means digits are clustered — there's an edge
  return {
    entropyScore: normalizedEntropy,
    isLowEntropy: normalizedEntropy < 0.96,
  };
}

// ─── Layer 5: Weighted Recency Model ───────────────────────────────

function recencyWeighted(window: number[]): { underScore: number; overScore: number } {
  if (window.length === 0) return { underScore: 0, overScore: 0 };

  const decay = 0.92; // exponential decay factor
  let underWeight = 0;
  let overWeight = 0;
  let totalWeight = 0;

  for (let i = 0; i < window.length; i++) {
    const weight = Math.pow(decay, window.length - 1 - i);
    totalWeight += weight;
    if (window[i] < 4) underWeight += weight;
    if (window[i] > 5) overWeight += weight;
  }

  return {
    underScore: totalWeight > 0 ? underWeight / totalWeight : 0,
    overScore: totalWeight > 0 ? overWeight / totalWeight : 0,
  };
}

// ─── Layer 6: Autocorrelation Lag Analysis ─────────────────────────

function autocorrelationAnalysis(window: number[]): { underAuto: number; overAuto: number } {
  if (window.length < 10) return { underAuto: 0, overAuto: 0 };

  // Convert to binary signals: 1 if under(<4), -1 if over(>5), 0 otherwise
  const underSignal = window.map(d => d < 4 ? 1 : 0);
  const overSignal = window.map(d => d > 5 ? 1 : 0);

  // Compute lag-1, lag-2, lag-3 autocorrelation
  const autoCorr = (signal: number[], lag: number) => {
    const n = signal.length;
    const mean = signal.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      den += (signal[i] - mean) ** 2;
      if (i >= lag) {
        num += (signal[i] - mean) * (signal[i - lag] - mean);
      }
    }
    return den > 0 ? num / den : 0;
  };

  // Average autocorrelation at lags 1-3
  const underAuto = (autoCorr(underSignal, 1) + autoCorr(underSignal, 2) * 0.7 + autoCorr(underSignal, 3) * 0.4) / 2.1;
  const overAuto = (autoCorr(overSignal, 1) + autoCorr(overSignal, 2) * 0.7 + autoCorr(overSignal, 3) * 0.4) / 2.1;

  return { underAuto, overAuto };
}

// ─── Expected Value Calculation ────────────────────────────────────

function expectedValue(winProb: number, stake: number): number {
  // DIGITUNDER 4: payout is based on digit range (digits 0-3 = 4/10 base)
  // DIGITOVER 5: payout is based on digit range (digits 6-9 = 4/10 base)
  // Deriv payout multiplier for these contracts ~1.0x profit on win
  const payoutMultiplier = 1.0;
  return (winProb * payoutMultiplier * stake) - ((1 - winProb) * stake);
}

// ─── Main 6-Layer Ensemble ─────────────────────────────────────────

export interface Under4Over5Signal {
  symbol: string;
  symbolName: string;
  direction: 'UNDER' | 'OVER' | null;
  confidence: number;
  ev: number;
  layerBreakdown: string;
}

export function predictUnder4Over5(
  data: SymbolData,
  config: TradingConfig,
): Under4Over5Signal | null {
  const window = data.recentWindow;
  if (window.length < 30) return null;

  // ── Run all 6 layers ──
  const layer1 = frequencyDominance(window);
  const layer2 = streakAnalysis(window);
  const layer3 = markovConditional(window);
  const layer4 = entropyRegime(window);
  const layer5 = recencyWeighted(window);
  const layer6 = autocorrelationAnalysis(window);

  // Skip if entropy is too uniform (no edge exists)
  if (!layer4.isLowEntropy) return null;

  // ── Weighted Ensemble for UNDER 4 ──
  const underScore = (
    layer1.underProb * 0.20 +       // Frequency dominance
    (layer2.underStreak > 0 ? Math.min(layer2.underStreak * 0.04, 0.15) : 0) + // Active streak bonus
    layer3.pUnder * 0.25 +           // Markov conditional
    (1 - layer4.entropyScore) * 0.10 + // Entropy bonus
    layer5.underScore * 0.20 +       // Recency weighted
    Math.max(layer6.underAuto * 0.10, 0) // Autocorrelation (positive only)
  );

  // ── Weighted Ensemble for OVER 5 ──
  const overScore = (
    layer1.overProb * 0.20 +
    (layer2.overStreak > 0 ? Math.min(layer2.overStreak * 0.04, 0.15) : 0) +
    layer3.pOver * 0.25 +
    (1 - layer4.entropyScore) * 0.10 +
    layer5.overScore * 0.20 +
    Math.max(layer6.overAuto * 0.10, 0)
  );

  // Scale to confidence percentage
  const underConfidence = Math.round(underScore * 100 * 10) / 10;
  const overConfidence = Math.round(overScore * 100 * 10) / 10;

  const threshold = config.confidenceThreshold || 60;
  const stake = config.initialStake || 0.35;

  // Pick the stronger direction
  let direction: 'UNDER' | 'OVER' | null = null;
  let confidence = 0;

  if (underConfidence >= overConfidence && underConfidence >= threshold) {
    direction = 'UNDER';
    confidence = underConfidence;
  } else if (overConfidence > underConfidence && overConfidence >= threshold) {
    direction = 'OVER';
    confidence = overConfidence;
  }

  if (!direction) return null;

  const winProb = confidence / 100;
  const ev = expectedValue(winProb, stake);
  if (ev <= 0) return null;

  const breakdown = [
    `Freq:${direction === 'UNDER' ? (layer1.underProb * 100).toFixed(0) : (layer1.overProb * 100).toFixed(0)}%`,
    `Strk:${direction === 'UNDER' ? layer2.underStreak : layer2.overStreak}`,
    `Mkv:${direction === 'UNDER' ? (layer3.pUnder * 100).toFixed(0) : (layer3.pOver * 100).toFixed(0)}%`,
    `Ent:${(layer4.entropyScore * 100).toFixed(0)}%`,
    `Rec:${direction === 'UNDER' ? (layer5.underScore * 100).toFixed(0) : (layer5.overScore * 100).toFixed(0)}%`,
    `AC:${direction === 'UNDER' ? (layer6.underAuto * 100).toFixed(0) : (layer6.overAuto * 100).toFixed(0)}%`,
  ].join(' ');

  return {
    symbol: data.symbol,
    symbolName: data.name,
    direction,
    confidence,
    ev: Math.round(ev * 1000) / 1000,
    layerBreakdown: breakdown,
  };
}

/**
 * Scan all symbols and return the best Under4/Over5 prediction
 */
export function generateUnder4Over5Predictions(
  symbolsData: Map<string, SymbolData>,
  config: TradingConfig,
): Prediction[] {
  const predictions: Prediction[] = [];

  symbolsData.forEach((data) => {
    const signal = predictUnder4Over5(data, config);
    if (!signal) return;

    predictions.push({
      symbol: signal.symbol,
      symbolName: signal.symbolName,
      contractType: signal.direction === 'UNDER' ? 'DIGITUNDER' : 'DIGITOVER',
      digit: signal.direction === 'UNDER' ? 4 : 5,
      confidence: signal.confidence,
      expectedValue: signal.ev,
      duration: config.autoPickDuration ? 5 : (config.manualDuration || 5),
      source: `U4O5 ${signal.layerBreakdown}`,
    });
  });

  predictions.sort((a, b) => b.expectedValue - a.expectedValue);
  return predictions.slice(0, 10);
}
