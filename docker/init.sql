CREATE TABLE IF NOT EXISTS runs (
  id                              SERIAL PRIMARY KEY,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_dir                        TEXT,
  n_hours                         INTEGER,
  n_packages_input                INTEGER,
  n_packages_selected             INTEGER,
  total_cost                      NUMERIC(18,2),
  total_demand_mwh                NUMERIC(18,2),
  energy_covered_by_packages_mwh  NUMERIC(18,2),
  spot_energy_mwh                 NUMERIC(18,2),
  total_fees_paid                 NUMERIC(18,2),
  total_savings                   NUMERIC(18,2)
);

CREATE TABLE IF NOT EXISTS run_packages (
  id               SERIAL PRIMARY KEY,
  run_id           INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  start_index      INTEGER,
  duration_hours   INTEGER,
  max_energy_mwh   NUMERIC(18,4),
  fee              NUMERIC(18,4),
  discount_percent NUMERIC(8,4)
);
