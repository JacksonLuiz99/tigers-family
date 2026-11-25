CREATE TABLE IF NOT EXISTS player_contacts (
  clan_tag TEXT NOT NULL,
  player_tag TEXT NOT NULL,
  phone TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (clan_tag, player_tag)
);
