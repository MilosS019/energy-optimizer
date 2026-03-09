import * as fs from 'fs';
import * as readline from 'readline';
import { Package, ParsedData } from './types';

/**
 * Parse prices.csv and demand.csv simultaneously.
 */
export async function parsePricesAndDemand(pricesPath: string, demandPath: string): Promise<ParsedData> {
  const [prices, demand] = await Promise.all([
    readCsvColumn(pricesPath, 1),
    readCsvColumn(demandPath, 1),
  ]);

  if (prices.length !== demand.length) {
    throw new Error(
      `Row count mismatch: prices has ${prices.length}, demand has ${demand.length}`
    );
  }

  return {
    prices: new Float64Array(prices),
    demand: new Float64Array(demand),
    n: prices.length,
  };
}

/**
 * Read a single numeric column (0-indexed) from a CSV, skipping the header row.
 */
function readCsvColumn(filePath: string, colIndex: number): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const values: number[] = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    let firstLine = true;
    rl.on('line', (line: string) => {
      if (firstLine) { firstLine = false; return; }
      if (!line.trim()) return;
      const comma = line.indexOf(',');
      const raw = colIndex === 0 ? line.slice(0, comma) : line.slice(comma + 1);
      values.push(parseFloat(raw));
    });

    rl.on('close', () => resolve(values));
    rl.on('error', reject);
  });
}

/**
 * Parse packages.json.
 * Under 256 MB: JSON.parse directly. Over 256 MB: stream line by line.
 */
export async function parsePackages(packagesPath: string): Promise<Package[]> {
  const stat = fs.statSync(packagesPath);
  const fileSizeBytes = stat.size;

  if (fileSizeBytes < 256 * 1024 * 1024) {
    const raw = fs.readFileSync(packagesPath, 'utf8');
    return JSON.parse(raw) as Package[];
  }

  return parsePackagesStreaming(packagesPath);
}

function parsePackagesStreaming(filePath: string): Promise<Package[]> {
  return new Promise((resolve, reject) => {
    const packages: Package[] = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === '[' || trimmed === ']') return;
      const json = trimmed.endsWith(',') ? trimmed.slice(0, -1) : trimmed;
      try {
        packages.push(JSON.parse(json) as Package);
      } catch {
        // Skip malformed lines silently
      }
    });

    rl.on('close', () => resolve(packages));
    rl.on('error', reject);
  });
}
