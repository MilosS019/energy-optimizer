# Energy Procurement Optimizer

Minimum-cost electricity purchasing strategy over a time-varying market.

Built with **Node.js + TypeScript + PostgreSQL**.

---

## Quick Start (Docker — recommended)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- Add demand.csv, packages.json and prices.csv in ./data

### Services

`docker-compose.yml` defines two services:

| Service | Description |
|---------|-------------|
| `db` | PostgreSQL 16, auto-initialised with `docker/init.sql` on first start. Data persisted in a named volume (`pgdata`). Exposed on port `5432`. |
| `optimizer` | Builds the Node.js app, waits for `db` to be healthy, then runs the optimizer against the mounted data directory. |

### Run

```bash
docker compose up --build
```

The optimizer container waits for Postgres to be ready, runs against `./data`, saves the result to the DB, and prints the JSON to stdout.

To capture the output to a file:

```bash
docker compose up --build 2>/dev/null > result.json
```

Progress messages go to stderr (visible in your terminal), JSON result goes to stdout (written to the file).

### Run against different data

```bash
docker compose run --rm -v /absolute/path/to/your/data:/data optimizer /data
```

### Inspect the database after a run

```bash
# Connect to the running Postgres container
docker compose exec db psql -U energy -d energy

# Inside psql:
SELECT id, created_at, n_hours, n_packages_selected, total_cost, total_savings
FROM runs
ORDER BY created_at DESC;

SELECT * FROM run_packages WHERE run_id = 1;
```

### Stop and clean up

```bash
# Stop containers (keeps DB volume)
docker compose down

# Stop and delete all data including the DB volume
docker compose down -v
```

---

## Local Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (running locally)

### Install

```bash
npm install
```

### Configure

```bash
cp .env.example .env
# Edit .env and set DATABASE_URL to your local Postgres instance
```

### Create the schema

```bash
psql $DATABASE_URL < docker/init.sql
```

### Build and run

```bash
npm run build
node dist/index.js ./data
```

Or run in dev mode (no build step):

```bash
npm run dev -- ./data
```

---

## Without a database

If `DATABASE_URL` is not set, the optimizer runs exactly as before — DB persistence is skipped automatically.

```bash
node dist/index.js ./data > result.json
```

---

## Input files

Place the following three files in a directory and pass that directory as the argument:

| File | Description |
|------|-------------|
| `prices.csv` | Hourly market prices (`timestamp,price`) |
| `demand.csv` | Hourly energy demand (`timestamp,demandMWh`) |
| `packages.json` | Available discount packages (JSON array) |

---

## Output

JSON written to **stdout**. Progress messages written to **stderr**.

```json
{
  "totalCost": 12345678.90,
  "packagesPurchased": [
    {
      "startIndex": 120,
      "durationHours": 24,
      "maxEnergyMWh": 100,
      "fee": 35.0,
      "discountPercent": 12.5
    }
  ],
  "statistics": {
    "totalDemandMWh": 987654.32,
    "energyCoveredByPackagesMWh": 543210.98,
    "spotEnergyMWh": 444443.34,
    "totalFeesPaid": 12345.67,
    "totalSavings": 765432.10
  }
}
```

Each completed run is also persisted to PostgreSQL in two tables:

- `runs` — top-level result and statistics
- `run_packages` — individual selected packages for the run

---


### Algorithm (5 phases)

#### Phase 1 — Parse
Prices and demand CSVs are read line-by-line (streaming) so memory stays low.
`packages.json` is loaded via `JSON.parse` for files under 256 MB; larger files
are streamed object-by-object.

#### Phase 2 — Prefix sums  O(N)
`prefixCost[i]` and `prefixDemand[i]` enable O(1) queries:
> "What is the total (price × demand) / total demand over any window [t, t+D)?"

#### Phase 3 — Pre-filter and bucket  O(M)
A package is discarded when its **theoretical maximum savings** cannot recover
its fee:
```
maxPossibleSavings = (discountPercent/100) × maxEnergyMWh × globalMaxPrice
if maxPossibleSavings ≤ fee → discard
```
Surviving packages are grouped into five log-scale **duration buckets**:
`[1–8h], [9–24h], [25–168h], [169–720h], [721h+]`.
Each bucket has a *characteristic window size* (its median duration).

#### Phase 4 — Greedy matching  O(M log M + N log K)
For each duration bucket with characteristic size D:

1. Score every valid D-hour window by its total `price × demand`
   (using O(1) prefix-sum queries). Find the top-K windows via a min-heap
   (K = number of packages in the bucket) in O(N log K).
2. Sort packages by discount rate descending.
3. Match best-package → best-window positionally.
4. For each matched pair, compute actual expected net savings using the
   package's real duration against live residual demand. Only keep if `savings > fee`.
5. For packages shorter than the bucket's D, a sub-window scan finds the
   optimal start within the matched region.

#### Phase 5 — Final allocation sweep  O(N × P_avg)
A single left-to-right sweep over all N hours:
- Active packages are maintained via start/end event lists.
- Demand at each hour is allocated greedily to the **highest-discount** active
  package first, respecting each package's remaining energy budget.
- Any unmet demand is purchased at spot price.

#### Phase 6 — Persist to DB
The result and all selected packages are saved to PostgreSQL in a single transaction.
Skipped if `DATABASE_URL` is not set.

### Complexity summary

| Phase | Time | Memory |
|-------|------|--------|
| Parse | O(N + M) | O(N + M) |
| Prefix sums | O(N) | O(N) |
| Filter + bucket | O(M) | O(M) |
| Greedy match | O(M log M + M × D_avg) | O(N + M) |
| Allocation | O(N × P_avg) | O(P) |
| DB persist | O(P) | O(1) |

### Benchmarks

| Input size | Execution time |
|-----------|---------------|
| 6 hours, 3 packages | < 30 ms |
| 50 000 hours, 100 000 packages | ~400 ms |
| 500 000 hours, 1 000 000 packages | ~3.5 s |

Tested on Node.js 22, Windows 11.

### Known limitations / trade-offs

- The greedy matching is a heuristic. For pathological inputs (many packages of
  identical quality competing for the same peak period) the result may differ
  slightly from the true optimum.
- The "savings gate" check uses an average price across the matched window.
  Packages with very small `maxEnergyMWh` whose value concentrates in a single
  peak hour within a long window may be slightly under-valued.
