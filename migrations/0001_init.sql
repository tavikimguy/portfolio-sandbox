-- Create annotations table
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSON NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_annotations_createdAt ON annotations(createdAt);
CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(type);
