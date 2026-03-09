import { buildPrefixSums } from './prefixSums';
import { Package, SelectedPackage, Window } from './types';

export function matchPackages(
  buckets: Map<number, Package[]>,
  prices: Float64Array,
  demand: Float64Array,
  n: number
): SelectedPackage[] {
  // Keeps track of updated demand
  const residualDemand = new Float64Array(demand);
  // Keeps track of packages we selected
  const selected: SelectedPackage[] = [];
  // Sorts the buckets starting from the biggest range to the shortest
  const sortedBuckets = [...buckets.entries()].sort((a, b) => b[0] - a[0]);

  for (const [duration, pkgs] of sortedBuckets) {
    if (pkgs.length === 0) continue;

    // Number of windows for the given duration
    const numWindows = n - duration + 1;
    if (numWindows <= 0) continue;

    const { prefixCost: resCost } = buildPrefixSums(prices, residualDemand, n);

    const packageNum = pkgs.length;

    // Keeps track of top windows sorted by the value we can get out of them
    const topWindows = scoreTopWindows(resCost, numWindows, duration, packageNum);

    // Sorts packages based on their discount
    const scoredPkgs = pkgs.map((pkg) => ({
      pkg,
      score: pkg.discountPercent,
      tiebreak: (pkg.discountPercent / 100) * pkg.maxEnergyMWh - pkg.fee,
    })).sort((a, b) =>
      b.score !== a.score ? b.score - a.score : b.tiebreak - a.tiebreak
    );

    const count = Math.min(scoredPkgs.length, topWindows.length);

    for (let i = 0; i < count; i++) {
      const { pkg } = scoredPkgs[i];
      const windowStart = topWindows[i].start;
      const startIdx = findBestStart(pkg, windowStart, duration, resCost, n);
      if (startIdx === -1) continue;

      const pkgDuration = pkg.durationHours;
      const end = startIdx + pkgDuration;
      let residualWindowDemand = 0;
      let residualWindowCost   = 0;
      for (let h = startIdx; h < end; h++) {
        const rd = residualDemand[h];
        residualWindowDemand += rd;
        residualWindowCost   += rd * prices[h];
      }

      if (residualWindowDemand < 1e-10) continue; // no demand left here

      const avgPrice    = residualWindowCost / residualWindowDemand;
      const allocatable = Math.min(pkg.maxEnergyMWh, residualWindowDemand);
      const savings     = (pkg.discountPercent / 100) * allocatable * avgPrice;

      if (savings <= pkg.fee) continue; // not profitable

      selected.push({ ...pkg, startIndex: startIdx });
      claimResidualDemand(residualDemand, prices, startIdx, pkgDuration, pkg.maxEnergyMWh);
    }
  }

  return selected;
}

// Reduce remaining demand for the given window
function claimResidualDemand(
  residualDemand: Float64Array,
  prices: Float64Array,
  start: number,
  duration: number,
  maxEnergy: number
): void {
  const end = start + duration;
  let budget = maxEnergy;

  if (duration <= 168) {
    const hours: number[] = [];
    for (let h = start; h < end; h++) {
      if (residualDemand[h] > 1e-10) hours.push(h);
    }
    hours.sort((a, b) => prices[b] - prices[a]);

    for (const h of hours) {
      if (budget <= 1e-10) break;
      const claim = Math.min(budget, residualDemand[h]);
      residualDemand[h] -= claim;
      budget -= claim;
    }
  } else {
    let totalResidual = 0;
    for (let h = start; h < end; h++) totalResidual += residualDemand[h];
    if (totalResidual < 1e-10) return;

    const fraction = Math.min(1, maxEnergy / totalResidual);
    for (let h = start; h < end; h++) {
      residualDemand[h] *= (1 - fraction);
    }
  }
}

// Scores all windows and keeps only needed ones
function scoreTopWindows(
  prefixCost: Float64Array,
  numWindows: number,
  duration: number,
  packageNum: number
): Window[] {
  const heap: Window[] = [];
  for (let t = 0; t < numWindows; t++) {
    const score = prefixCost[t + duration] - prefixCost[t];
    if (heap.length < packageNum) {
      heap.push({ start: t, score });
      if (heap.length === packageNum) heapify(heap);
    } else if (score > heap[0].score) {
      heap[0] = { start: t, score };
      siftDown(heap, 0, heap.length);
    }
  }
  heap.sort((a, b) => b.score - a.score);
  return heap;
}

function heapify(arr: Window[]): void {
  for (let i = Math.floor(arr.length / 2) - 1; i >= 0; i--) {
    siftDown(arr, i, arr.length);
  }
}

function siftDown(arr: Window[], i: number, n: number): void {
  while (true) {
    let smallest = i;
    const l = 2 * i + 1, r = 2 * i + 2;
    if (l < n && arr[l].score < arr[smallest].score) smallest = l;
    if (r < n && arr[r].score < arr[smallest].score) smallest = r;
    if (smallest === i) break;
    [arr[i], arr[smallest]] = [arr[smallest], arr[i]];
    i = smallest;
  }
}

// Find the best starting hour for the package within the matched window region.
function findBestStart(
  pkg: Package,
  windowStart: number,
  duration: number,
  resCost: Float64Array,
  n: number
): number {
  const pkgDuration = pkg.durationHours;

  if (windowStart + pkgDuration > n) {
    const latest = n - pkgDuration;
    return latest >= 0 ? latest : -1;
  }

  if (pkgDuration >= duration) return windowStart;

  // Last index where the package can begin
  const scanEnd = Math.min(windowStart + duration - pkgDuration, n - pkgDuration);
  let bestStart = windowStart;
  let bestScore = resCost[windowStart + pkgDuration] - resCost[windowStart];

  for (let t = windowStart + 1; t <= scanEnd; t++) {
    const score = resCost[t + pkgDuration] - resCost[t];
    if (score > bestScore) {
      bestScore = score;
      bestStart = t;
    }
  }

  return bestStart;
}
