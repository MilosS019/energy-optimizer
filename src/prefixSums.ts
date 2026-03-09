import { PrefixSums } from './types';


// Build demand/price arrays for O(1) window assessment
export function buildPrefixSums(prices: Float64Array, demand: Float64Array, n: number): PrefixSums {
  const prefixCost   = new Float64Array(n + 1);
  const prefixDemand = new Float64Array(n + 1);

  for (let i = 0; i < n; i++) {
    prefixCost[i + 1]   = prefixCost[i]   + prices[i] * demand[i];
    prefixDemand[i + 1] = prefixDemand[i] + demand[i];
  }

  return { prefixCost, prefixDemand };
}

export function windowCost(prefixCost: Float64Array, startIdx: number, duration: number): number {
  return prefixCost[startIdx + duration] - prefixCost[startIdx];
}

export function windowDemand(prefixDemand: Float64Array, startIdx: number, duration: number): number {
  return prefixDemand[startIdx + duration] - prefixDemand[startIdx];
}
