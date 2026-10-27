CREATE TABLE daily_summaries (
  day TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed')),
  title TEXT NOT NULL DEFAULT '',
  overview TEXT NOT NULL DEFAULT '',
  tiers TEXT NOT NULL DEFAULT '[]',
  item_count INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  error_code TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
