-- V2 — clinical review metadata and source attribution.
--
-- PRD C1/C2/C8 need somewhere to record who reviewed a tip, when, and what it is
-- based on. The columns start NULL and stay NULL until a named clinician actually
-- signs off: an unreviewed row is the honest state, and the API/UI report it as
-- such. Do not backfill guessed dates or invented reviewers here.
--
-- OceanBase (MySQL mode) constraints observed:
--   * One ADD COLUMN per ALTER. A failed multi-clause ALTER wedges later deploys
--     until the portal's Repair migration history is run, so keep each statement
--     independently retryable.
--   * No foreign keys, no DDL mixed with DML.

ALTER TABLE tips ADD COLUMN reviewed_on DATE NULL;

ALTER TABLE tips ADD COLUMN reviewed_by VARCHAR(200) NULL;

ALTER TABLE tips ADD COLUMN source VARCHAR(500) NULL;

-- Reviewers may later want "show me everything past due"; a cheap index on the
-- review date keeps that query from scanning the table.
CREATE INDEX idx_tips_reviewed_on ON tips (reviewed_on);