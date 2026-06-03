-- PayZo dev DB — runs once after Hibernate creates the schema (ddl-auto=create).
--
-- ⚠ Prod note: Hibernate skips this file when ddl-auto=validate. For prod, run
-- the SQL below manually once after deploy. Keep this file in sync.
--
-- Single line per statement: Hibernate's default import.sql parser splits on
-- newlines, so multi-line DDL would otherwise be treated as multiple broken statements.

-- Race-condition guard on the transfer pipeline (ANALYSE_ARCHITECTURE.md #4):
-- a client may have at most one transaction in PENDING_OTP or PENDING_SCORING
-- at any time. Enforced as a partial unique index so APPROVED / REJECTED rows
-- (which can be many per client) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uk_tx_client_in_progress ON transactions (client_id) WHERE status IN ('PENDING_OTP', 'PENDING_SCORING');
