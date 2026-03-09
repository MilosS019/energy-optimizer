import { SelectedPackage, OptimizationResult } from './types';

interface AllocatedPackage extends SelectedPackage {
  remainingEnergy: number;
  allocatedEnergy: number;
}

export function allocate(
  selectedPackages: SelectedPackage[],
  prices: Float64Array,
  demand: Float64Array,
  n: number
): OptimizationResult {
  const pkgs: AllocatedPackage[] = selectedPackages.map((p) => ({
    ...p,
    remainingEnergy: p.maxEnergyMWh,
    allocatedEnergy: 0,
  }));

  pkgs.sort((a, b) => b.discountPercent - a.discountPercent);

  // Build start/end event lists to maintain active set efficiently.
  const startEvents: number[][] = Array.from({ length: n }, () => []);
  const endEvents:   number[][] = Array.from({ length: n }, () => []);

  for (let i = 0; i < pkgs.length; i++) {
    const p = pkgs[i];
    const endHour = Math.min(p.startIndex + p.durationHours - 1, n - 1);
    if (p.startIndex >= 0 && p.startIndex < n) startEvents[p.startIndex].push(i);
    if (endHour >= 0 && endHour < n)           endEvents[endHour].push(i);
  }

  let spotCost              = 0;
  let packageDiscountedCost = 0;
  let spotEquivalentCost    = 0;
  let totalSpotEnergy       = 0;
  let totalPkgEnergy        = 0;

  // Active list: indices into pkgs[], kept sorted descending by discountPercent.
  const active: number[] = [];

  for (let h = 0; h < n; h++) {
    const price = prices[h];
    const dem   = demand[h];

    // Activate packages starting this hour
    for (const idx of startEvents[h]) {
      insertSorted(active, idx, pkgs);
    }

    // Allocate demand to active packages (highest discount first)
    let remaining = dem;

    for (let ai = 0; ai < active.length && remaining > 1e-10; ai++) {
      const idx = active[ai];
      const pkg = pkgs[idx];
      if (pkg.remainingEnergy <= 1e-10) continue;

      const alloc = Math.min(remaining, pkg.remainingEnergy);
      pkg.remainingEnergy   -= alloc;
      pkg.allocatedEnergy   += alloc;
      packageDiscountedCost += alloc * price * (1 - pkg.discountPercent / 100);
      spotEquivalentCost    += alloc * price;
      totalPkgEnergy        += alloc;
      remaining             -= alloc;
    }

    // Remainder at spot price
    if (remaining > 1e-10) {
      spotCost        += remaining * price;
      totalSpotEnergy += remaining;
    }

    // Deactivate packages ending this hour
    for (const idx of endEvents[h]) {
      const pos = active.indexOf(idx);
      if (pos !== -1) active.splice(pos, 1);
    }
  }

  const totalFeesPaid = pkgs.reduce((sum, p) => sum + p.fee, 0);
  const totalCost     = spotCost + packageDiscountedCost + totalFeesPaid;
  const totalDemand   = demand.reduce((s, d) => s + d, 0);
  const totalSavings  = Math.max(0, spotEquivalentCost - packageDiscountedCost - totalFeesPaid);

  const packagesPurchased: SelectedPackage[] = pkgs.map((p) => ({
    startIndex:      p.startIndex,
    durationHours:   p.durationHours,
    maxEnergyMWh:    p.maxEnergyMWh,
    fee:             p.fee,
    discountPercent: p.discountPercent,
  }));

  return {
    totalCost: roundTo2(totalCost),
    packagesPurchased,
    statistics: {
      totalDemandMWh:             roundTo2(totalDemand),
      energyCoveredByPackagesMWh: roundTo2(totalPkgEnergy),
      spotEnergyMWh:              roundTo2(totalSpotEnergy),
      totalFeesPaid:              roundTo2(totalFeesPaid),
      totalSavings:               roundTo2(totalSavings),
    },
  };
}

function insertSorted(active: number[], idx: number, pkgs: AllocatedPackage[]): void {
  const disc = pkgs[idx].discountPercent;
  let lo = 0, hi = active.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (pkgs[active[mid]].discountPercent >= disc) lo = mid + 1;
    else hi = mid;
  }
  active.splice(lo, 0, idx);
}

function roundTo2(v: number): number {
  return Math.round(v * 100) / 100;
}
