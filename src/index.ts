import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

import { parsePricesAndDemand, parsePackages } from './parser';
import { buildPrefixSums } from './prefixSums';
import { filterAndBucket } from './packageFilter';
import { matchPackages } from './greedyMatcher';
import { allocate } from './allocator';
import { saveRun, closePool } from './db';

async function main(): Promise<void> {
  const dataDir      = process.argv[2] || process.cwd();
  const pricesPath   = path.join(dataDir, 'prices.csv');
  const demandPath   = path.join(dataDir, 'demand.csv');
  const packagesPath = path.join(dataDir, 'packages.json');

  const t0 = Date.now();

  // ---- Phase 1: Parse --------------------------------------------------------
  process.stderr.write('[1/5] Parsing input files...\n');
  const [{ prices, demand, n }, rawPackages] = await Promise.all([
    parsePricesAndDemand(pricesPath, demandPath),
    parsePackages(packagesPath),
  ]);
  process.stderr.write(`${n} hours, ${rawPackages.length} packages loaded in ${Date.now() - t0}ms\n`);

  // ---- Phase 2: Prefix sums --------------------------------------------------
  process.stderr.write('[2/5] Building prefix sums...\n');
  buildPrefixSums(prices, demand, n); // warms up typed arrays; used inside greedyMatcher

  // ---- Phase 3: Pre-filter & bucket ------------------------------------------
  process.stderr.write('[3/5] Filtering and bucketing packages...\n');
  const globalMaxPrice = prices.reduce((m, p) => (p > m ? p : m), 0);
  const { buckets, discarded } = filterAndBucket(rawPackages, globalMaxPrice, n);

  let surviving = 0;
  for (const pkgs of buckets.values()) surviving += pkgs.length;
  process.stderr.write(`${discarded} packages discarded, ${surviving} surviving\n`);

  // ---- Phase 4: Greedy matching ----------------------------------------------
  process.stderr.write('[4/5] Greedy package matching...\n');
  const selected = matchPackages(buckets, prices, demand, n);
  process.stderr.write(`${selected.length} packages selected\n`);

  // ---- Phase 5: Final allocation & cost computation -------------------------
  process.stderr.write('[5/5] Final allocation sweep...\n');
  const result = allocate(selected, prices, demand, n);

  process.stderr.write(`\nDone in ${Date.now() - t0}ms\n\n`);

  // ---- Phase 6: Persist to DB (opt-in — skips if DATABASE_URL is not set) ---
  if (process.env.DATABASE_URL) {
    process.stderr.write('[6/6] Saving run to database...\n');
    try {
        const runId = await saveRun(result, {
        dataDir,
        nHours:         n,
        nPackagesInput: rawPackages.length,
      });
      process.stderr.write(`Run saved with id=${runId}\n`);
    } finally {
      await closePool();
    }
  }

  // ---- Output ----------------------------------------------------------------
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch((err: Error) => {
  process.stderr.write(`Error: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
