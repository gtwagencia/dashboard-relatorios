-- Add creative/thumbnail fields to ads table
ALTER TABLE ads
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS creative_id   VARCHAR(100);
