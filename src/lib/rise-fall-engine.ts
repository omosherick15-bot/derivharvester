/**
 * Rise/Fall Ensemble Prediction Engine
 * 
 * 4-Model ensemble: LSTM-like (temporal), Gradient Boosting (feature interactions),
 * Random Forest (noise stability), Logistic Regression (meta-model).
 * 
 * All models are statistical approximations designed for browser execution.
 * Combined with HMM filter for regime detection.
 */

export interface RiseFallSignal {
  pRise: number;
  pFall: number;
  confidence: number;
  direction: 'RISE' | 'FALL' | null;
  source: string;
  cooldownActive: boolean;
}

interface FeatureSet {
  momentum: number;
  rsi: number;
  maSlope: number;
  volatilityRatio: number;
  stochastic: number;
  tickReturns: number[];
  movingAvg5: number;
  movingAvg10: number;
  movingAvg20: number;
  volatility: number;
  pricePosition: number; // position within recent range
}

// Per-symbol cooldown tracker
const cooldownMap = new Map<string, number>();

export function resetRiseFallCooldowns(): void {
  cooldownMap.clear();
}

/** Record that a trade was placed on a symbol */
export function markRiseFallTrade(symbol: string, tickCount: number): void {
  cooldownMap.set(symbol, tickCount);
}

/** Check if symbol is on cooldown (skip 5 ticks after each trade) */
function isCooldownActive(symbol: string, tickCount: number): boolean {
  const lastTrade = cooldownMap.get(symbol);
  if (lastTrade === undefined) return false;
  return (tickCount - lastTrade) < 5;
}

// ─── Feature Engineering ───────────────────────────────────────────

function computeFeatures(prices: number[]): FeatureSet | null {
  if (prices.length < 25) return null;

  const recent = prices.slice(-50);
  const returns = [];
  for (let i = 1; i < recent.length; i++) {
    returns.push(recent[i] - recent[i - 1]);
  }

  // Momentum (sum of last 5 returns)
  const last5Returns = returns.slice(-5);
  const momentum = last5Returns.reduce((a, b) => a + b, 0);

  // RSI (14-period)
  const rsiPeriod = Math.min(14, returns.length);
  const rsiReturns = returns.slice(-rsiPeriod);
  let gains = 0, losses = 0;
  for (const r of rsiReturns) {
    if (r > 0) gains += r;
    else losses += Math.abs(r);
  }
  const avgGain = gains / rsiPeriod;
  const avgLoss = losses / rsiPeriod || 0.0001;
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  // Moving averages
  const ma = (arr: number[], n: number) => {
    const s = arr.slice(-n);
    return s.reduce((a, b) => a + b, 0) / s.length;
  };
  const movingAvg5 = ma(recent, 5);
  const movingAvg10 = ma(recent, 10);
  const movingAvg20 = ma(recent, 20);

  // MA slope (5-period MA change over last 3 ticks)
  const prevMa5 = ma(recent.slice(0, -3), 5);
  const maSlope = movingAvg5 - prevMa5;

  // Volatility (std dev of returns)
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const volatility = Math.sqrt(returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / returns.length);

  // Volatility ratio (recent vs longer-term)
  const recentVol = Math.sqrt(last5Returns.reduce((s, r) => s + (r - (last5Returns.reduce((a, b) => a + b, 0) / 5)) ** 2, 0) / 5);
  const volatilityRatio = volatility > 0 ? recentVol / volatility : 1;

  // Stochastic oscillator (14-period)
  const stochPeriod = recent.slice(-14);
  const stochHigh = Math.max(...stochPeriod);
  const stochLow = Math.min(...stochPeriod);
  const stochRange = stochHigh - stochLow || 0.0001;
  const stochastic = ((recent[recent.length - 1] - stochLow) / stochRange) * 100;

  // Price position within range
  const rangeHigh = Math.max(...recent);
  const rangeLow = Math.min(...recent);
  const totalRange = rangeHigh - rangeLow || 0.0001;
  const pricePosition = (recent[recent.length - 1] - rangeLow) / totalRange;

  return {
    momentum, rsi, maSlope, volatilityRatio, stochastic,
    tickReturns: returns.slice(-20),
    movingAvg5, movingAvg10, movingAvg20,
    volatility, pricePosition,
  };
}

// ─── Model 1: LSTM-like Temporal Sequence Model ───────────────────

function lstmPredict(features: FeatureSet): number {
  const { tickReturns, momentum, movingAvg5, movingAvg10 } = features;
  
  // Simulate LSTM: weighted combination of temporal features
  // Hidden state accumulates momentum and trend signals
  let hiddenState = 0;
  const forgetGate = 0.85;
  const inputGate = 0.15;

  for (const ret of tickReturns) {
    // Normalize return to [-1, 1] range
    const normalizedRet = Math.tanh(ret * 100);
    hiddenState = forgetGate * hiddenState + inputGate * normalizedRet;
  }

  // Combine with trend indicators
  const trendSignal = movingAvg5 > movingAvg10 ? 0.1 : -0.1;
  const momentumSignal = Math.tanh(momentum * 50) * 0.2;

  // Output gate: sigmoid activation
  const rawOutput = hiddenState * 0.5 + trendSignal + momentumSignal;
  const pRise = 1 / (1 + Math.exp(-rawOutput * 3));

  return Math.max(0.2, Math.min(0.8, pRise));
}

// ─── Model 2: Gradient Boosting (XGBoost-like) ───────────────────

function gradientBoostPredict(features: FeatureSet): number {
  const { rsi, momentum, maSlope, volatilityRatio, stochastic, pricePosition } = features;

  // Simulate gradient boosting with multiple weak learners (decision stumps)
  let score = 0;

  // Tree 1: RSI-based
  if (rsi < 30) score += 0.15;       // oversold → rise
  else if (rsi > 70) score -= 0.15;  // overbought → fall
  else score += (50 - rsi) * 0.002;

  // Tree 2: Momentum
  if (momentum > 0) score += Math.min(momentum * 20, 0.12);
  else score += Math.max(momentum * 20, -0.12);

  // Tree 3: MA slope interaction
  score += Math.tanh(maSlope * 100) * 0.1;

  // Tree 4: Stochastic + volatility interaction
  if (stochastic < 20 && volatilityRatio < 1.2) score += 0.1;
  else if (stochastic > 80 && volatilityRatio < 1.2) score -= 0.1;

  // Tree 5: Price position
  if (pricePosition < 0.3) score += 0.08;
  else if (pricePosition > 0.7) score -= 0.08;

  // Tree 6: Volatility ratio extremes
  if (volatilityRatio > 2.0) score *= 0.5; // reduce confidence in high vol

  const pRise = 1 / (1 + Math.exp(-score * 4));
  return Math.max(0.2, Math.min(0.8, pRise));
}

// ─── Model 3: Random Forest ──────────────────────────────────────

function randomForestPredict(features: FeatureSet): number {
  const { rsi, momentum, maSlope, stochastic, pricePosition, volatility, tickReturns } = features;

  // Simulate 7 decision trees with different feature subsets
  const trees: number[] = [];

  // Tree 1: RSI + momentum
  trees.push(rsi < 45 && momentum > 0 ? 0.6 : rsi > 55 && momentum < 0 ? 0.4 : 0.5);

  // Tree 2: MA slope + stochastic
  trees.push(maSlope > 0 && stochastic < 60 ? 0.58 : maSlope < 0 && stochastic > 40 ? 0.42 : 0.5);

  // Tree 3: Price position + volatility
  trees.push(pricePosition < 0.4 ? 0.55 : pricePosition > 0.6 ? 0.45 : 0.5);

  // Tree 4: Recent return trend (last 3 returns)
  const last3 = tickReturns.slice(-3);
  const trendUp = last3.filter(r => r > 0).length;
  trees.push(trendUp >= 2 ? 0.57 : trendUp <= 1 ? 0.43 : 0.5);

  // Tree 5: Stochastic reversal
  trees.push(stochastic < 25 ? 0.6 : stochastic > 75 ? 0.4 : 0.5);

  // Tree 6: Momentum magnitude
  const momMag = Math.abs(momentum);
  const momDir = momentum > 0 ? 0.55 : 0.45;
  trees.push(momMag > 0 ? momDir : 0.5);

  // Tree 7: Volatility regime
  trees.push(volatility < 0.5 ? 0.52 : 0.48);

  // Average all trees (bagging)
  const avgPrediction = trees.reduce((a, b) => a + b, 0) / trees.length;
  return Math.max(0.25, Math.min(0.75, avgPrediction));
}

// ─── Model 4: Logistic Regression Meta-Model ─────────────────────

function logisticMetaModel(
  lstmP: number,
  xgbP: number,
  rfP: number,
  volatilityFactor: number,
  hmmBias: number
): number {
  // Learned weights for each model
  const w_lstm = 0.35;
  const w_xgb = 0.30;
  const w_rf = 0.20;
  const w_vol = -0.10; // high volatility slightly reduces confidence
  const w_hmm = 0.15;  // HMM regime bias
  const bias = -0.02;

  const z = w_lstm * (lstmP - 0.5) +
            w_xgb * (xgbP - 0.5) +
            w_rf * (rfP - 0.5) +
            w_vol * (volatilityFactor - 1) +
            w_hmm * hmmBias +
            bias;

  const pRise = 1 / (1 + Math.exp(-z * 6));
  return Math.max(0.15, Math.min(0.85, pRise));
}

// ─── Main Ensemble Prediction ─────────────────────────────────────

export function predictRiseFall(
  symbol: string,
  prices: number[],
  tickCount: number,
  hmmBelief: number = 0,
  confidenceThreshold: number = 60
): RiseFallSignal {
  const nullSignal: RiseFallSignal = {
    pRise: 0.5, pFall: 0.5, confidence: 0,
    direction: null, source: 'Insufficient data', cooldownActive: false,
  };

  // Cooldown check
  if (isCooldownActive(symbol, tickCount)) {
    return { ...nullSignal, cooldownActive: true, source: 'Cooldown active' };
  }

  const features = computeFeatures(prices);
  if (!features) return nullSignal;

  // Volatility filter: skip if volatility is too low (no movement)
  if (features.volatility < 0.001) {
    return { ...nullSignal, source: 'Volatility too low' };
  }

  // Run all 4 models
  const lstmP = lstmPredict(features);
  const xgbP = gradientBoostPredict(features);
  const rfP = randomForestPredict(features);

  // HMM bias: positive = trending up regime, negative = trending down
  const hmmBias = Math.tanh(hmmBelief * 0.5);
  const volatilityFactor = features.volatilityRatio;

  // Meta-model combines all predictions
  const finalP = logisticMetaModel(lstmP, xgbP, rfP, volatilityFactor, hmmBias);

  const pRise = finalP;
  const pFall = 1 - finalP;

  // Confidence = distance from 0.5, scaled to percentage
  const rawConfidence = Math.abs(finalP - 0.5) * 200; // 0-100%
  const confidence = Math.round(rawConfidence * 10) / 10;

  // Direction determination with threshold
  let direction: 'RISE' | 'FALL' | null = null;
  if (pRise > (confidenceThreshold / 100)) direction = 'RISE';
  else if (pFall > (confidenceThreshold / 100)) direction = 'FALL';

  const source = `LSTM:${(lstmP * 100).toFixed(0)}% XGB:${(xgbP * 100).toFixed(0)}% RF:${(rfP * 100).toFixed(0)}% HMM:${hmmBias.toFixed(2)}`;

  return { pRise, pFall, confidence, direction, source, cooldownActive: false };
}
