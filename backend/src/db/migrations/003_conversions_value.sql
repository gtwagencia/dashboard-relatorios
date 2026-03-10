-- Add conversions_value column to store daily purchase/sales revenue from Meta API
ALTER TABLE campaign_metrics
  ADD COLUMN IF NOT EXISTS conversions_value NUMERIC(14, 2) DEFAULT 0;
