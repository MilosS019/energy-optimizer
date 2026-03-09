import { Package } from './types';

interface Bucket {
  min:      number;
  max:      number;
  duration: number;
}

export const BUCKETS: Bucket[] = [
  { min: 1,   max: 8,        duration: 4    },
  { min: 9,   max: 24,       duration: 16   },
  { min: 25,  max: 168,      duration: 96   },
  { min: 169, max: 720,      duration: 440  },
  { min: 721, max: Infinity, duration: 1200 },
];

interface FilterResult {
  buckets:   Map<number, Package[]>;
  discarded: number;
}

export function filterAndBucket(
  packages: Package[],
  globalMaxPrice: number,
  n: number
): FilterResult {
  const buckets = new Map<number, Package[]>();
  for (const b of BUCKETS) buckets.set(b.duration, []);

  let discarded = 0;

  for (const pkg of packages) {
    const { durationHours, maxEnergyMWh, fee, discountPercent } = pkg;

    const maxSavings = (discountPercent / 100) * maxEnergyMWh * globalMaxPrice;
    if (maxSavings <= fee) { discarded++; continue; }

    const bucket = getBucket(durationHours);
    buckets.get(bucket.duration)!.push(pkg);
  }

  return { buckets, discarded };
}

function getBucket(durationHours: number): Bucket {
  for (const b of BUCKETS) {
    if (durationHours >= b.min && durationHours <= b.max) return b;
  }
  return BUCKETS[BUCKETS.length - 1];
}
