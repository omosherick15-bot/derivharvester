// ===== Digit Analytics Engine =====
import { DigitData } from './types';

export function createDigitData(): DigitData {
  return {
    digitCounts: new Array(10).fill(0),
    recentDigits: [],
    recentWindow: [],
    lastTick: 0,
    sparkline: [],
  };
}

export function extractLastDigit(price: number): number {
  // Multiply by 1000 to preserve three decimal places, then round
  const scaled = Math.round(price * 1000);
  // Get last digit of scaled number
  return scaled % 10;
}

export function updateDigitData(data: DigitData, tick: number): DigitData {
  const digit = extractLastDigit(tick);
  const newDigits = [...data.recentDigits, digit].slice(-200);
  const newWindow = newDigits.slice(-50);
  const newCounts = new Array(10).fill(0);
  newDigits.forEach(d => newCounts[d]++);
  const newSparkline = [...data.sparkline, tick].slice(-5);

  return {
    digitCounts: newCounts,
    recentDigits: newDigits,
    recentWindow: newWindow,
    lastTick: tick,
    sparkline: newSparkline,
  };
}

// Digit frequency distribution from recent window
export function getDigitFrequency(window: number[]): number[] {
  const freq = new Array(10).fill(0);
  window.forEach(d => freq[d]++);
  return freq.map(f => f / (window.length || 1));
}

// Shannon entropy
export function shannonEntropy(freq: number[]): number {
  return -freq.reduce((sum, p) => {
    if (p <= 0) return sum;
    return sum + p * Math.log2(p);
  }, 0);
}

// Uniform entropy for 10 digits = log2(10) ≈ 3.3219
export const UNIFORM_ENTROPY = Math.log2(10);

// Markov chain: P(next | current)
export function markovTransitionMatrix(digits: number[]): number[][] {
  const counts: number[][] = Array.from({ length: 10 }, () => new Array(10).fill(0));
  for (let i = 0; i < digits.length - 1; i++) {
    counts[digits[i]][digits[i + 1]]++;
  }
  return counts.map(row => {
    const total = row.reduce((s, v) => s + v, 0);
    return total > 0 ? row.map(v => v / total) : new Array(10).fill(0.1);
  });
}

// Cycle detection: find repeating sequences of length 2-5
export function detectCycles(digits: number[]): { digit: number; count: number }[] {
  const results: { digit: number; count: number }[] = [];
  if (digits.length < 10) return results;

  for (let len = 2; len <= 5; len++) {
    const lastSeq = digits.slice(-len);
    let count = 0;
    for (let i = 0; i <= digits.length - len; i++) {
      const seq = digits.slice(i, i + len);
      if (seq.every((v, idx) => v === lastSeq[idx])) count++;
    }
    if (count >= 3) {
      // The next expected digit after this sequence
      const nextDigitIndex = digits.length;
      // Look for what follows this sequence historically
      for (let i = 0; i <= digits.length - len - 1; i++) {
        const seq = digits.slice(i, i + len);
        if (seq.every((v, idx) => v === lastSeq[idx])) {
          results.push({ digit: digits[i + len], count });
        }
      }
    }
  }
  return results;
}

// Tick variance for volatility filter
export function tickVariance(digits: number[]): number {
  if (digits.length < 2) return 0;
  const mean = digits.reduce((s, v) => s + v, 0) / digits.length;
  return digits.reduce((s, v) => s + (v - mean) ** 2, 0) / digits.length;
}

// Expected value calculation
export function calculateEV(winProb: number, profitPerWin: number, stake: number): number {
  return (winProb * profitPerWin) - ((1 - winProb) * stake);
}

// Simulate duration on historical data to find best win rate
export function simulateDurations(
  digits: number[],
  contractType: string,
  targetDigit: number,
  maxDuration: number = 10
): { duration: number; winRate: number }[] {
  const results: { duration: number; winRate: number }[] = [];

  for (let dur = 1; dur <= Math.min(maxDuration, digits.length - 1); dur++) {
    let wins = 0;
    let total = 0;
    for (let i = 0; i < digits.length - dur; i++) {
      const resultDigit = digits[i + dur];
      const won = evaluateContract(contractType, targetDigit, resultDigit);
      if (won) wins++;
      total++;
    }
    results.push({ duration: dur, winRate: total > 0 ? wins / total : 0 });
  }
  return results;
}

function evaluateContract(contractType: string, target: number, result: number): boolean {
  switch (contractType) {
    case 'DIGITOVER': return result > target;
    case 'DIGITUNDER': return result < target;
    case 'DIGITMATCH': return result === target;
    case 'DIGITDIFF': return result !== target;
    case 'DIGITEVEN': return result % 2 === 0;
    case 'DIGITODD': return result % 2 !== 0;
    default: return false;
  }
}
