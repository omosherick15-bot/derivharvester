/**
 * Alpha-Beta Hidden Markov Model Filter for EVEN/ODD Digit Prediction
 * 
 * Detects short-term statistical clustering in digit parity and exploits
 * temporary deviations from pure randomness in EVEN/ODD distributions.
 */

export interface HMMFilterState {
  belief: number;         // Lₜ — log-likelihood ratio of hidden state
  prediction: 'EVEN' | 'ODD' | null;
  confidence: number;     // |Lₜ|
  signalStrength: 'Weak' | 'Moderate' | 'Strong' | 'None';
}

export interface HMMFilterParams {
  alpha: number;   // observation weighting parameter
  beta: number;    // memory decay parameter
  theta: number;   // confidence threshold
}

export const DEFAULT_HMM_PARAMS: HMMFilterParams = {
  alpha: 0.35,
  beta: 0.08,
  theta: 0.60,
};

/**
 * Maintains per-symbol HMM filter belief states.
 * Call updateBelief() on every new tick to get the latest signal.
 */
export class AlphaBetaHMMFilter {
  private beliefs: Map<string, number> = new Map();
  private params: HMMFilterParams;

  constructor(params: HMMFilterParams = DEFAULT_HMM_PARAMS) {
    this.params = params;
  }

  /** Reset belief for a symbol or all symbols */
  reset(symbol?: string): void {
    if (symbol) {
      this.beliefs.delete(symbol);
    } else {
      this.beliefs.clear();
    }
  }

  /** 
   * Update belief with a new digit observation.
   * Returns the current filter state including prediction and confidence.
   */
  updateBelief(symbol: string, digit: number): HMMFilterState {
    const { alpha, beta, theta } = this.params;

    // Convert digit to binary observation: +1 if EVEN, -1 if ODD
    const xi = digit % 2 === 0 ? 1 : -1;

    // Get previous belief (default 0 = no bias)
    const prevBelief = this.beliefs.get(symbol) || 0;

    // Alpha-Beta recursive filter: Lₜ₊₁ = (1 − β) * Lₜ + α * ξₜ
    const newBelief = (1 - beta) * prevBelief + alpha * xi;
    this.beliefs.set(symbol, newBelief);

    // Determine prediction and confidence
    const confidence = Math.abs(newBelief);
    let prediction: 'EVEN' | 'ODD' | null = null;
    let signalStrength: HMMFilterState['signalStrength'] = 'None';

    if (newBelief > theta) {
      prediction = 'EVEN';
    } else if (newBelief < -theta) {
      prediction = 'ODD';
    }

    if (prediction) {
      if (confidence >= theta * 2.5) {
        signalStrength = 'Strong';
      } else if (confidence >= theta * 1.5) {
        signalStrength = 'Moderate';
      } else {
        signalStrength = 'Weak';
      }
    }

    return { belief: newBelief, prediction, confidence, signalStrength };
  }

  /** Get current state for a symbol without updating */
  getState(symbol: string): HMMFilterState {
    const belief = this.beliefs.get(symbol) || 0;
    const { theta } = this.params;
    const confidence = Math.abs(belief);
    let prediction: 'EVEN' | 'ODD' | null = null;
    let signalStrength: HMMFilterState['signalStrength'] = 'None';

    if (belief > theta) {
      prediction = 'EVEN';
    } else if (belief < -theta) {
      prediction = 'ODD';
    }

    if (prediction) {
      if (confidence >= theta * 2.5) {
        signalStrength = 'Strong';
      } else if (confidence >= theta * 1.5) {
        signalStrength = 'Moderate';
      } else {
        signalStrength = 'Weak';
      }
    }

    return { belief, prediction, confidence, signalStrength };
  }

  /** Batch-process a digit history to initialize the filter for a symbol */
  initializeFromHistory(symbol: string, digits: number[]): HMMFilterState {
    this.beliefs.delete(symbol);
    let state: HMMFilterState = { belief: 0, prediction: null, confidence: 0, signalStrength: 'None' };
    for (const d of digits) {
      state = this.updateBelief(symbol, d);
    }
    return state;
  }
}
