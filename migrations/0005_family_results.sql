CREATE TABLE IF NOT EXISTS family_war_results (
  id TEXT PRIMARY KEY,
  clan_tag TEXT NOT NULL,
  end_at INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  score_stars INTEGER NOT NULL,
  attack_stars INTEGER,
  detailed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS family_war_results_period ON family_war_results(end_at, clan_tag);
