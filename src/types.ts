export interface Package {
  durationHours:   number;
  maxEnergyMWh:    number;
  fee:             number;
  discountPercent: number;
}

export interface SelectedPackage extends Package {
  startIndex: number;
}

export interface ParsedData {
  prices: Float64Array;
  demand: Float64Array;
  n:      number;
}

export interface PrefixSums {
  prefixCost:   Float64Array;
  prefixDemand: Float64Array;
}

export interface Window {
  start: number;
  score: number;
}

export interface OptimizationResult {
  totalCost:         number;
  packagesPurchased: SelectedPackage[];
  statistics: {
    totalDemandMWh:               number;
    energyCoveredByPackagesMWh:   number;
    spotEnergyMWh:                number;
    totalFeesPaid:                number;
    totalSavings:                 number;
  };
}
