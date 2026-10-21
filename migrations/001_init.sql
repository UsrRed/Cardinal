CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  instructions TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('rss','osv','nvd')),
  source_params TEXT NOT NULL,
  frequency_hours INTEGER NOT NULL,
  freshness_days INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  notify INTEGER NOT NULL DEFAULT 0,
  notify_threshold TEXT NOT NULL DEFAULT 'high',
  ntfy_server TEXT,
  ntfy_topic TEXT,
  model TEXT NOT NULL,
  budget_usd REAL NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_run_at INTEGER,
  next_run_at INTEGER,
  defer_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_feeds_due ON feeds(enabled, next_run_at);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  trigger TEXT NOT NULL,
  steps TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  kept_count INTEGER NOT NULL DEFAULT 0,
  notified_count INTEGER NOT NULL DEFAULT 0,
  no_news INTEGER NOT NULL DEFAULT 0,
  digest_id TEXT,
  error_code TEXT,
  queued_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);
CREATE INDEX idx_runs_feed ON runs(feed_id, queued_at DESC);
CREATE INDEX idx_runs_status ON runs(status, queued_at);

CREATE TABLE run_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  ts INTEGER NOT NULL,
  level TEXT NOT NULL,
  step TEXT,
  message TEXT NOT NULL
);
CREATE INDEX idx_run_logs_run ON run_logs(run_id, id);

CREATE TABLE digests (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  lede TEXT NOT NULL,
  sections TEXT NOT NULL,
  partial INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_digests_feed ON digests(feed_id, created_at DESC);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  digest_id TEXT NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  ref TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  priority TEXT NOT NULL,
  justification TEXT NOT NULL,
  summary TEXT NOT NULL,
  sources TEXT NOT NULL,
  published_at INTEGER,
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_items_feed ON items(feed_id, created_at DESC);
CREATE INDEX idx_items_digest ON items(digest_id);

CREATE TABLE seen_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id TEXT NOT NULL,
  dedup_key TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  UNIQUE(feed_id, dedup_key)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
