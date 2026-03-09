import { Pool, PoolClient } from 'pg';
import { OptimizationResult } from './types';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

interface RunMeta {
  dataDir:        string;
  nHours:         number;
  nPackagesInput: number;
}

export async function saveRun(result: OptimizationResult, meta: RunMeta): Promise<number> {
  const client: PoolClient = await getPool().connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO runs
         (data_dir, n_hours, n_packages_input, n_packages_selected,
          total_cost, total_demand_mwh, energy_covered_by_packages_mwh,
          spot_energy_mwh, total_fees_paid, total_savings)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        meta.dataDir,
        meta.nHours,
        meta.nPackagesInput,
        result.packagesPurchased.length,
        result.totalCost,
        result.statistics.totalDemandMWh,
        result.statistics.energyCoveredByPackagesMWh,
        result.statistics.spotEnergyMWh,
        result.statistics.totalFeesPaid,
        result.statistics.totalSavings,
      ]
    );

    const runId: number = rows[0].id;

    for (const pkg of result.packagesPurchased) {
      await client.query(
        `INSERT INTO run_packages
           (run_id, start_index, duration_hours, max_energy_mwh, fee, discount_percent)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [runId, pkg.startIndex, pkg.durationHours, pkg.maxEnergyMWh, pkg.fee, pkg.discountPercent]
      );
    }

    await client.query('COMMIT');
    return runId;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
