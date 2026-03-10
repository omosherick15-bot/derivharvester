// ===== Prediction Engine =====
import { ContractType, DigitData, Prediction } from './types';
import {
  getDigitFrequency,
  shannonEntropy,
  UNIFORM_ENTROPY,
  markovTransitionMatrix,
  detectCycles,
  tickVariance,
  calculateEV,
  simulateDurations,
} from './analytics';

const PAYOUT_RATE = 0.95; // Deriv typical payout

interface PredictionCandidate {
  contractType: ContractType;
  digit: number;
  confidence: number;
  source: string;
}

export function generatePredictions(
  data: DigitData,
  stake: number,
  confidenceThreshold: number,
  tickDuration: number | null
): Prediction[] {
  const { recentWindow, recentDigits } = data;
  if (recentWindow.length < 20) return [];

  // Volatility filter
  const variance = tickVariance(recentWindow);
  if (variance < 1.5 || variance > 12) return [];

  // Entropy check
  const freq = getDigitFrequency(recentWindow);
  const entropy = shannonEntropy(freq);
  if (entropy >= UNIFORM_ENTROPY - 0.05) return []; // Too uniform, no edge

  const candidates: PredictionCandidate[] = [];

  // 1. Heatmap-based predictions
  const sortedByFreq = freq.map((f, i) => ({ digit: i, freq: f })).sort((a, b) => b.freq - a.freq);
  const leastFreq = sortedByFreq[sortedByFreq.length - 1];
  const mostFreq = sortedByFreq[0];

  // DIGITDIFF on most frequent (likely to differ from rare)
  if (leastFreq.freq < 0.06) {
    candidates.push({
      contractType: 'DIGITDIFF',
      digit: leastFreq.digit,
      confidence: 1 - leastFreq.freq,
      source: 'heatmap',
    });
  }

  // DIGITOVER/UNDER based on distribution skew
  if (mostFreq.digit <= 3 && mostFreq.freq > 0.15) {
    candidates.push({
      contractType: 'DIGITOVER',
      digit: mostFreq.digit,
      confidence: freq.slice(mostFreq.digit + 1).reduce((s, v) => s + v, 0),
      source: 'heatmap',
    });
  }
  if (mostFreq.digit >= 6 && mostFreq.freq > 0.15) {
    candidates.push({
      contractType: 'DIGITUNDER',
      digit: mostFreq.digit,
      confidence: freq.slice(0, mostFreq.digit).reduce((s, v) => s + v, 0),
      source: 'heatmap',
    });
  }

  // Even/Odd bias
  const evenProb = freq.filter((_, i) => i % 2 === 0).reduce((s, v) => s + v, 0);
  const oddProb = 1 - evenProb;
  if (evenProb > 0.6) {
    candidates.push({ contractType: 'DIGITEVEN', digit: 0, confidence: evenProb, source: 'heatmap' });
  }
  if (oddProb > 0.6) {
    candidates.push({ contractType: 'DIGITODD', digit: 1, confidence: oddProb, source: 'heatmap' });
  }

  // 2. Markov chain predictions
  if (recentWindow.length > 1) {
    const matrix = markovTransitionMatrix(recentWindow);
    const currentDigit = recentWindow[recentWindow.length - 1];
    const nextProbs = matrix[currentDigit];
    const maxProb = Math.max(...nextProbs);
    const predictedDigit = nextProbs.indexOf(maxProb);

    if (maxProb > 0.15) {
      candidates.push({
        contractType: 'DIGITMATCH',
        digit: predictedDigit,
        confidence: maxProb,
        source: 'markov',
      });

      // Also add DIGITDIFF for the least likely next digit
      const minProb = Math.min(...nextProbs);
      const leastLikely = nextProbs.indexOf(minProb);
      candidates.push({
        contractType: 'DIGITDIFF',
        digit: leastLikely,
        confidence: 1 - minProb,
        source: 'markov',
      });
    }

    // Markov-based over/under
    const overProb = nextProbs.slice(predictedDigit + 1).reduce((s, v) => s + v, 0);
    if (predictedDigit <= 4 && overProb > 0.6) {
      candidates.push({
        contractType: 'DIGITOVER',
        digit: predictedDigit,
        confidence: overProb,
        source: 'markov',
      });
    }
  }

  // 3. Cycle detection
  const cycles = detectCycles(recentWindow);
  if (cycles.length > 0) {
    const digitCounts: Record<number, number> = {};
    cycles.forEach(c => {
      digitCounts[c.digit] = (digitCounts[c.digit] || 0) + c.count;
    });
    const bestCycleDigit = Object.entries(digitCounts).sort(([, a], [, b]) => b - a)[0];
    if (bestCycleDigit) {
      const d = parseInt(bestCycleDigit[0]);
      candidates.push({
        contractType: 'DIGITMATCH',
        digit: d,
        confidence: Math.min(0.75, 0.5 + bestCycleDigit[1] * 0.05),
        source: 'cycle',
      });
    }
  }

  // Combine and filter by confidence + EV
  const predictions: Prediction[] = [];
  for (const c of candidates) {
    if (c.confidence < confidenceThreshold) continue;

    const profitPerWin = stake * PAYOUT_RATE;
    const ev = calculateEV(c.confidence, profitPerWin, stake);
    if (ev <= 0) continue;

    // Duration selection
    let bestDuration = 1;
    if (tickDuration !== null) {
      bestDuration = tickDuration;
    } else {
      const sims = simulateDurations(recentDigits, c.contractType, c.digit);
      if (sims.length > 0) {
        const best = sims.sort((a, b) => b.winRate - a.winRate)[0];
        bestDuration = best.duration;
      }
    }

    predictions.push({
      ...c,
      expectedValue: ev,
      duration: bestDuration,
    });
  }

  // Sort by EV descending
  return predictions.sort((a, b) => b.expectedValue - a.expectedValue);
}
