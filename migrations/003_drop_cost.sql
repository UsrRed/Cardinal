-- Cost/token tracking and per-feed budgets removed: they did not serve the product.
UPDATE runs SET status = 'succeeded', error_code = NULL WHERE status = 'budget_exceeded';
ALTER TABLE feeds DROP COLUMN budget_usd;
ALTER TABLE runs DROP COLUMN input_tokens;
ALTER TABLE runs DROP COLUMN output_tokens;
ALTER TABLE runs DROP COLUMN cost_usd;
ALTER TABLE daily_summaries DROP COLUMN input_tokens;
ALTER TABLE daily_summaries DROP COLUMN output_tokens;
ALTER TABLE daily_summaries DROP COLUMN cost_usd;
ALTER TABLE digests DROP COLUMN partial;
