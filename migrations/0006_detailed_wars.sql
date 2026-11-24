CREATE TABLE IF NOT EXISTS detailed_wars (
  id TEXT PRIMARY KEY,
  clan_tag TEXT NOT NULL,
  end_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS detailed_wars_clan_period ON detailed_wars(clan_tag,end_at DESC);
