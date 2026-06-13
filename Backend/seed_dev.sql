-- Dev-only seed data for the backoffice (dashboard, clients, staff, fraud alerts,
-- audit log, ML config). Idempotent: re-running wipes the rows it owns and
-- recreates them, so the schema stays predictable.
--
-- Run from host:  docker exec -i postgres-db psql -U payzo_user -d payzo_db < Backend/seed_dev.sql
--
-- SAFETY / NAMESPACE
-- ------------------
-- Every row this script owns lives under the `@seed.payzo.tn` email domain (for
-- users) or carries a `"_seed":true` marker (audit logs) / `TRX-S-%` reference
-- (transactions). The wipe in section 0 only ever touches those. This means the
-- script is safe to run next to:
--   * your real loginnable backoffice accounts on `@payzo.tn`, and
--   * the live ML demo personas seeded by DemoSeedService on `*.demo@payzo.tn`
--     (Ahmed / Karim / Leila / Sarra / Mohamed / Mounir) — their carefully
--     shaped per-user transaction history is never swept into this seed.
--
-- Volume: 2 admins, 2 analysts, 30 clients (mixed statuses across the 5 enum
-- values so the Clients page tabs each have content), ~3500 transactions over
-- the last 365 days + a denser "today" block, fraud alerts (with analyst
-- attribution + comments + trust deltas), ~16 audit-log entries across actions
-- and actors, 2 ML threshold proposals (1 pending), and the SA notification bell.

\set ON_ERROR_STOP on

-- Deterministic CIN → bank / account-number mapping. MUST stay identical to the
-- copy in seed_dev_cbs.sql so each seeded transaction's source/dest account
-- numbers resolve to the real CBS accounts created there (needed for the
-- backoffice fraud-alert APPROVE flow, which executes a real CBS transfer).
CREATE OR REPLACE FUNCTION seed_bank_alpha(cin text) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT (ARRAY['STB','ATB','BIAT','ZTB','AMEN','BTE','UIB'])[(cin::bigint % 7)::int + 1] $$;
CREATE OR REPLACE FUNCTION seed_bank_num(cin text) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT (ARRAY['10','04','08','25','07','11','12'])[(cin::bigint % 7)::int + 1] $$;
CREATE OR REPLACE FUNCTION seed_acct(cin text) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT seed_bank_num(cin) || '001' || lpad(cin, 13, '0') || '00' $$;

-- ── 0. Wipe previous seed (idempotency) ────────────────────────────────
-- FK-safe order: alerts → transactions → threshold reports → audit logs →
-- SA notifications → users. Each delete is namespaced to seed-owned rows only.
DELETE FROM fraud_alerts        WHERE transaction_id IN (SELECT id FROM transactions WHERE reference LIKE 'TRX-S-%');
DELETE FROM transactions        WHERE reference LIKE 'TRX-S-%';
DELETE FROM ml_threshold_reports WHERE analyst_id IN (SELECT id FROM users WHERE email LIKE '%@seed.payzo.tn');
DELETE FROM audit_logs          WHERE metadata LIKE '%"_seed":true%';
-- Bell-dropdown seed lives in user_notifications. Drop only the rows this seed
-- inserts (matched by their fixed titles) so real SA notifications survive.
DELETE FROM user_notifications
 WHERE user_id IN (SELECT id FROM users WHERE role = 'SUPERADMIN')
   AND title IN ('Threshold report submitted','Client blocked','New analyst joined',
                 'ML backup back online','Bank added','Admin created',
                 'Client unblocked','Analyst created','Colleague left');
DELETE FROM users WHERE email LIKE '%@seed.payzo.tn' AND role IN ('CLIENT','ADMIN','ANALYST');

-- ── 1. Admins (2) and Analysts (2) ─────────────────────────────────────
-- Phone / governorate / address / DOB populated so the Staff Management
-- expanded panel has fields to render. Display-only rows (no Keycloak user) —
-- they populate the staff list but are not meant to log in.
INSERT INTO users (
  id, email, first_name, last_name, phone, governorate, address, date_of_birth,
  role, status, first_login_completed, created_at, updated_at, username
)
VALUES
  (gen_random_uuid(), 'mohamed.khelifi@seed.payzo.tn','Mohamed','Khelifi', '+21698123001','Tunis',   '12 Rue de la Liberté',     '1985-03-12','ADMIN',   'ACTIVE', true, NOW()-INTERVAL '60 days', NOW(), 'mohamed.khelifi'),
  (gen_random_uuid(), 'fatma.benali@seed.payzo.tn',  'Fatma',  'Ben Ali', '+21698123002','Sousse',  '8 Avenue de la République','1990-07-25','ADMIN',   'ACTIVE', true, NOW()-INTERVAL '55 days', NOW(), 'fatma.benali'),
  (gen_random_uuid(), 'tarek.sassi@seed.payzo.tn',   'Tarek',  'Sassi',   '+21698123003','Sfax',    '22 Rue Ibn Khaldoun',      '1988-11-04','ANALYST', 'ACTIVE', true, NOW()-INTERVAL '50 days', NOW(), 'tarek.sassi'),
  (gen_random_uuid(), 'nadia.trabelsi@seed.payzo.tn','Nadia',  'Trabelsi','+21698123004','Monastir','5 Avenue Bourguiba',       '1992-02-19','ANALYST', 'ACTIVE', true, NOW()-INTERVAL '45 days', NOW(), 'nadia.trabelsi');

-- Lifecycle attribution for admins/analysts: link them to the SuperAdmin so
-- the Staff Management expanded panel can show "Created by · SuperAdmin · …".
DO $$
DECLARE
  sa_id UUID;
BEGIN
  SELECT id INTO sa_id FROM users WHERE role = 'SUPERADMIN' LIMIT 1;
  IF sa_id IS NULL THEN RETURN; END IF;
  UPDATE users
     SET created_by = sa_id,
         decided_by = sa_id,
         decided_at = created_at + INTERVAL '1 hour'
   WHERE role IN ('ADMIN','ANALYST') AND email LIKE '%@seed.payzo.tn';
END $$;

-- ── 2. Clients (30, mixed statuses) ────────────────────────────────────
-- Status spread (so every Clients-page tab has content):
--   3 PENDING, 2 ACCEPTED-derived (status=ACTIVE, firstLogin=false),
--   2 BLOCKED, 2 REJECTED, 21 ACTIVE (firstLogin=true).
-- "ACCEPTED" is a derived UX state, not a real DB status — clients show as
-- ACCEPTED in the All tab when status=ACTIVE/BLOCKED AND firstLoginCompleted=false.
INSERT INTO users (
  id, email, first_name, last_name, cin, phone, governorate, address, date_of_birth,
  role, status, trust_score, first_login_completed,
  created_at, updated_at, username, default_account_id
)
VALUES
  -- PENDING (3) — fresh sign-ups awaiting an admin's decision.
  (gen_random_uuid(),'sara.mansouri@seed.payzo.tn','Sara','Mansouri','10000001','+21621100001','Tunis','12 Avenue Habib Bourguiba, Apt 4','1995-03-14','CLIENT','PENDING',50,false,NOW()-INTERVAL '2 days',NOW(),'sara.m','100000000001'),
  (gen_random_uuid(),'karim.bouaziz@seed.payzo.tn','Karim','Bouaziz','10000002','+21621100002','Sousse','27 Rue de la République','1992-11-02','CLIENT','PENDING',50,false,NOW()-INTERVAL '1 days',NOW(),'karim.b','100000000002'),
  (gen_random_uuid(),'yacine.laribi@seed.payzo.tn','Yacine','Laribi','10000003','+21621100003','Sfax','5 Rue Mongi Slim','1988-07-22','CLIENT','PENDING',50,false,NOW()-INTERVAL '6 hours',NOW(),'yacine.l','100000000003'),

  -- ACCEPTED-derived (2) — admin approved, credentials sent, hasn't done first
  -- login yet. status=ACTIVE + firstLoginCompleted=false.
  (gen_random_uuid(),'amira.cherif@seed.payzo.tn','Amira','Cherif','10000004','+21621100004','Monastir','Avenue Habib Bourguiba, Imm. Carthage, Apt 4','1997-01-09','CLIENT','ACTIVE',50,false,NOW()-INTERVAL '4 days',NOW(),'amira.c','100000000004'),
  (gen_random_uuid(),'walid.zoghlami@seed.payzo.tn','Walid','Zoghlami','10000005','+21621100005','Bizerte','18 Rue Ibn Khaldoun','1990-05-18','CLIENT','ACTIVE',50,false,NOW()-INTERVAL '3 days',NOW(),'walid.z','100000000005'),

  -- BLOCKED (2) — previously active, suspended by an admin.
  (gen_random_uuid(),'mariem.gharbi@seed.payzo.tn','Mariem','Gharbi','10000006','+21621100006','Nabeul','9 Avenue Farhat Hached','1986-09-30','CLIENT','BLOCKED',38,true,NOW()-INTERVAL '240 days',NOW(),'mariem.g','100000000006'),
  (gen_random_uuid(),'hamdi.touati@seed.payzo.tn','Hamdi','Touati','10000007','+21621100007','Tunis','45 Rue de Marseille','1993-12-11','CLIENT','BLOCKED',42,true,NOW()-INTERVAL '225 days',NOW(),'hamdi.t','100000000007'),

  -- REJECTED (2) — admin denied the registration.
  (gen_random_uuid(),'rim.jelassi@seed.payzo.tn','Rim','Jelassi','10000008','+21621100008','Mahdia','3 Rue Taïeb Mhiri','1999-04-25','CLIENT','REJECTED',50,false,NOW()-INTERVAL '210 days',NOW(),'rim.j','100000000008'),
  (gen_random_uuid(),'omar.belkadi@seed.payzo.tn','Omar','Belkadi','10000009','+21621100009','Gabes','22 Avenue Mohamed V','1985-02-08','CLIENT','REJECTED',50,false,NOW()-INTERVAL '195 days',NOW(),'omar.b','100000000009'),

  -- ACTIVE (21) — happy path, full lifecycle, will get the bulk of transactions.
  (gen_random_uuid(),'ines.kacem@seed.payzo.tn','Ines','Kacem','10000010','+21621100010','Kairouan','7 Rue Ali Belhouane','1991-06-17','CLIENT','ACTIVE',66,true,NOW()-INTERVAL '180 days',NOW(),'ines.k','100000000010'),
  (gen_random_uuid(),'ahmed.dridi@seed.payzo.tn','Ahmed','Dridi','10000011','+21621100011','Tunis','14 Rue Jugurtha, Mutuelleville','1994-08-04','CLIENT','ACTIVE',73,true,NOW()-INTERVAL '170 days',NOW(),'ahmed.d','100000000011'),
  (gen_random_uuid(),'leila.ferchichi@seed.payzo.tn','Leila','Ferchichi','10000012','+21621100012','Sousse','30 Avenue Hédi Chaker','1989-10-13','CLIENT','ACTIVE',62,true,NOW()-INTERVAL '160 days',NOW(),'leila.f','100000000012'),
  (gen_random_uuid(),'mehdi.saidi@seed.payzo.tn','Mehdi','Saidi','10000013','+21621100013','Sfax','11 Rue Ibn Sina','1996-02-26','CLIENT','ACTIVE',54,true,NOW()-INTERVAL '150 days',NOW(),'mehdi.s','100000000013'),
  (gen_random_uuid(),'salma.bouazizi@seed.payzo.tn','Salma','Bouazizi','10000014','+21621100014','Monastir','Route de la Corniche, Résidence El Manar','1987-12-01','CLIENT','ACTIVE',69,true,NOW()-INTERVAL '140 days',NOW(),'salma.b','100000000014'),
  (gen_random_uuid(),'ayoub.khlifi@seed.payzo.tn','Ayoub','Khlifi','10000015','+21621100015','Bizerte','19 Rue d''Espagne','1998-03-20','CLIENT','ACTIVE',81,true,NOW()-INTERVAL '130 days',NOW(),'ayoub.k','100000000015'),
  (gen_random_uuid(),'nour.hammami@seed.payzo.tn','Nour','Hammami','10000016','+21621100016','Nabeul','6 Rue de Tunis','1992-07-07','CLIENT','ACTIVE',70,true,NOW()-INTERVAL '120 days',NOW(),'nour.h','100000000016'),
  (gen_random_uuid(),'bilel.rouissi@seed.payzo.tn','Bilel','Rouissi','10000017','+21621100017','Tunis','38 Avenue de la Liberté','1984-05-29','CLIENT','ACTIVE',45,true,NOW()-INTERVAL '110 days',NOW(),'bilel.r','100000000017'),
  (gen_random_uuid(),'syrine.hadj@seed.payzo.tn','Syrine','Hadj','10000018','+21621100018','Mahdia','2 Rue de la Plage','1995-09-10','CLIENT','ACTIVE',77,true,NOW()-INTERVAL '100 days',NOW(),'syrine.h','100000000018'),
  (gen_random_uuid(),'firas.amri@seed.payzo.tn','Firas','Amri','10000019','+21621100019','Gabes','10 Rue de Carthage','1990-11-23','CLIENT','ACTIVE',58,true,NOW()-INTERVAL '90 days',NOW(),'firas.a','100000000019'),
  (gen_random_uuid(),'eya.brahem@seed.payzo.tn','Eya','Brahem','10000020','+21621100020','Kairouan','15 Rue Habib Thameur','1993-04-05','CLIENT','ACTIVE',65,true,NOW()-INTERVAL '80 days',NOW(),'eya.b','100000000020'),
  (gen_random_uuid(),'wassim.chaouch@seed.payzo.tn','Wassim','Chaouch','10000021','+21621100021','Tunis','21 Rue de la Kasbah','1988-08-18','CLIENT','ACTIVE',52,true,NOW()-INTERVAL '70 days',NOW(),'wassim.c','100000000021'),
  (gen_random_uuid(),'maya.fendri@seed.payzo.tn','Maya','Fendri','10000022','+21621100022','Sousse','40 Boulevard du 7 Novembre','2000-01-30','CLIENT','ACTIVE',83,true,NOW()-INTERVAL '60 days',NOW(),'maya.f','100000000022'),
  (gen_random_uuid(),'aymen.zaibi@seed.payzo.tn','Aymen','Zaibi','10000023','+21621100023','Sfax','8 Rue Salah Ben Youssef','1986-06-12','CLIENT','ACTIVE',61,true,NOW()-INTERVAL '50 days',NOW(),'aymen.z','100000000023'),
  (gen_random_uuid(),'rania.mzoughi@seed.payzo.tn','Rania','Mzoughi','10000024','+21621100024','Monastir','25 Avenue Bourguiba, Skanes','1991-10-24','CLIENT','ACTIVE',68,true,NOW()-INTERVAL '40 days',NOW(),'rania.m','100000000024'),
  (gen_random_uuid(),'sami.gaaloul@seed.payzo.tn','Sami','Gaaloul','10000025','+21621100025','Bizerte','13 Rue de la Corniche','1989-02-15','CLIENT','ACTIVE',74,true,NOW()-INTERVAL '35 days',NOW(),'sami.g','100000000025'),
  (gen_random_uuid(),'lina.bourguiba@seed.payzo.tn','Lina','Bourguiba','10000026','+21621100026','Nabeul','17 Rue Hannibal','1996-12-03','CLIENT','ACTIVE',79,true,NOW()-INTERVAL '30 days',NOW(),'lina.b','100000000026'),
  (gen_random_uuid(),'fares.dhaouadi@seed.payzo.tn','Fares','Dhaouadi','10000027','+21621100027','Tunis','4 Rue d''Algérie','1983-07-19','CLIENT','ACTIVE',56,true,NOW()-INTERVAL '20 days',NOW(),'fares.d','100000000027'),
  (gen_random_uuid(),'asma.makni@seed.payzo.tn','Asma','Makni','10000028','+21621100028','Mahdia','9 Rue Hédi Nouira','1997-05-08','CLIENT','ACTIVE',71,true,NOW()-INTERVAL '15 days',NOW(),'asma.m','100000000028'),
  (gen_random_uuid(),'hatem.naili@seed.payzo.tn','Hatem','Naili','10000029','+21621100029','Gabes','16 Rue de Sfax','1985-09-27','CLIENT','ACTIVE',47,true,NOW()-INTERVAL '10 days',NOW(),'hatem.n','100000000029'),
  (gen_random_uuid(),'inesse.aouini@seed.payzo.tn','Inesse','Aouini','10000030','+21621100030','Kairouan','23 Avenue Ibn El Jazzar','1994-11-14','CLIENT','ACTIVE',85,true,NOW()-INTERVAL '5 days',NOW(),'inesse.a','100000000030');

-- ── 2b. Lifecycle attribution ─────────────────────────────────────────
-- Link every non-PENDING client's decided_by / decided_at to admin1 so the
-- Clients-page expanded view can show "Accepted by · Admin · Mohamed Khelifi".
DO $$
DECLARE
  admin1_id UUID;
BEGIN
  SELECT id INTO admin1_id FROM users WHERE email = 'mohamed.khelifi@seed.payzo.tn';
  IF admin1_id IS NULL THEN RETURN; END IF;

  UPDATE users
     SET decided_by = admin1_id,
         decided_at = created_at + INTERVAL '4 hours'
   WHERE role = 'CLIENT'
     AND status IN ('ACCEPTED','ACTIVE','BLOCKED','REJECTED')
     AND email LIKE '%@seed.payzo.tn';

  UPDATE users
     SET decision_reason = 'Suspicious transaction patterns flagged by analyst'
   WHERE role = 'CLIENT' AND status = 'BLOCKED' AND email LIKE '%@seed.payzo.tn';

  UPDATE users
     SET decision_reason = 'Identity could not be verified against CBS'
   WHERE role = 'CLIENT' AND status = 'REJECTED' AND email LIKE '%@seed.payzo.tn';
END $$;

-- ── 2c. Point each seeded client's default account at their CBS account ──
UPDATE users SET default_account_id = seed_acct(cin)
 WHERE role = 'CLIENT' AND email LIKE '%@seed.payzo.tn';

-- ── 3. Transactions ─────────────────────────────────────────────────────
-- Two passes, both over SEEDED ACTIVE clients only (email @seed.payzo.tn) so
-- the demo personas' and real clients' histories are never touched:
--   Pass A — 3500 transactions over the last 365 days.
--   Pass B — 30 transactions dated today, spread across hours 06:00–22:00.
DO $$
DECLARE
  client_ids   UUID[];
  client_cins  TEXT[];
  bank_codes   TEXT[] := ARRAY['STB','ATB','BIAT','ZTB','AMEN','BTE','UIB'];
  n_clients    INT;
  n_banks      INT := array_length(bank_codes, 1);
  i            INT;
  c_id         UUID;
  src_cin      TEXT;
  dst_cin      TEXT;
  src_b        TEXT;
  dst_b        TEXT;
  amt          NUMERIC;
  ts           TIMESTAMPTZ;
  ref          TEXT;
  status_pick  NUMERIC;
  risk_pick    NUMERIC;
  status_val   TEXT;
  risk_val     TEXT;
  hour_pick    INT;
BEGIN
  -- Restrict to SEEDED status=ACTIVE AND firstLogin=true clients only.
  SELECT array_agg(id ORDER BY cin), array_agg(cin ORDER BY cin)
    INTO client_ids, client_cins
    FROM users
    WHERE role = 'CLIENT'
      AND status = 'ACTIVE'
      AND first_login_completed = true
      AND email LIKE '%@seed.payzo.tn';
  IF client_ids IS NULL THEN
    RAISE NOTICE 'No seeded ACTIVE CLIENT users found — abort.';
    RETURN;
  END IF;
  n_clients := array_length(client_ids, 1);

  -- Pass A — 3500 over 365 days
  FOR i IN 1..3500 LOOP
    c_id    := client_ids[((i - 1) % n_clients) + 1];
    src_cin := client_cins[((i - 1) % n_clients) + 1];
    dst_cin := client_cins[((i - 1 + 7) % n_clients) + 1];
    -- Bank + account derived from the client CIN so they match the CBS rows.
    src_b := seed_bank_alpha(src_cin);
    dst_b := seed_bank_alpha(dst_cin);
    amt := round((random() * 4900 + 50)::numeric, 2);
    ts  := NOW() - (random() * 365 || ' days')::interval;
    ref := 'TRX-S-' || lpad(i::text, 6, '0');

    status_pick := random();
    risk_pick   := random();
    status_val  := CASE
      WHEN status_pick < 0.92 THEN 'APPROVED'
      WHEN status_pick < 0.97 THEN 'SUSPENDED_PENDING_ANALYST'
      ELSE 'REJECTED'
    END;
    -- Suspended transfers always carry a MED/HIGH risk level (LOW auto-approves,
    -- so a suspended LOW would be inconsistent with the live pipeline).
    risk_val := CASE
      WHEN status_val = 'SUSPENDED_PENDING_ANALYST'
        THEN CASE WHEN risk_pick < 0.6 THEN 'MEDIUM' ELSE 'HIGH' END
      WHEN risk_pick < 0.85 THEN 'LOW'
      WHEN risk_pick < 0.95 THEN 'MEDIUM'
      ELSE 'HIGH'
    END;

    INSERT INTO transactions (
      id, client_id, amount,
      source_bank_code, dest_bank_code,
      source_account_number, destination_account_number,
      dest_client_cin,
      reference, status,
      created_at, updated_at,
      otp_confirmed_at, executed_at,
      source_balance_before, dest_balance_before,
      risk_level, risk_score, motif
    ) VALUES (
      gen_random_uuid(), c_id, amt,
      src_b, dst_b,
      seed_acct(src_cin),
      seed_acct(dst_cin),
      dst_cin,
      ref, status_val,
      ts, ts,
      CASE WHEN status_val = 'APPROVED' THEN ts + INTERVAL '2 minutes' ELSE NULL END,
      CASE WHEN status_val = 'APPROVED' THEN ts + INTERVAL '5 minutes' ELSE NULL END,
      round((random() * 50000 + 5000)::numeric, 2),
      round((random() * 50000 + 5000)::numeric, 2),
      risk_val,
      round(random()::numeric, 4),
      'P2P transfer'
    );
  END LOOP;

  -- Pass B — 30 transactions today, hours 06:00..22:00, all banks
  FOR i IN 1..30 LOOP
    c_id    := client_ids[((i - 1) % n_clients) + 1];
    src_cin := client_cins[((i - 1) % n_clients) + 1];
    dst_cin := client_cins[((i - 1 + 7) % n_clients) + 1];
    src_b := seed_bank_alpha(src_cin);
    dst_b := seed_bank_alpha(dst_cin);
    amt := round((random() * 4900 + 50)::numeric, 2);
    hour_pick := 6 + floor(random() * 16)::int;  -- 06..21
    ts  := date_trunc('day', NOW())
            + (hour_pick || ' hours')::interval
            + (floor(random() * 60) || ' minutes')::interval;
    ref := 'TRX-S-T' || lpad(i::text, 5, '0');

    INSERT INTO transactions (
      id, client_id, amount,
      source_bank_code, dest_bank_code,
      source_account_number, destination_account_number,
      dest_client_cin,
      reference, status,
      created_at, updated_at,
      otp_confirmed_at, executed_at,
      source_balance_before, dest_balance_before,
      risk_level, risk_score, motif
    ) VALUES (
      gen_random_uuid(), c_id, amt,
      src_b, dst_b,
      seed_acct(src_cin),
      seed_acct(dst_cin),
      dst_cin,
      ref, 'APPROVED',
      ts, ts,
      ts + INTERVAL '2 minutes', ts + INTERVAL '5 minutes',
      round((random() * 50000 + 5000)::numeric, 2),
      round((random() * 50000 + 5000)::numeric, 2),
      'LOW',
      round(random()::numeric, 4),
      'P2P transfer (today)'
    );
  END LOOP;
END $$;

-- ── 4. Fraud alerts (with analyst attribution, comment, trust delta) ─────
-- One alert per suspended transaction. ~60% validated (analyst said NOT fraud,
-- transfer released), ~25% pending (the actionable queue), ~15% rejected
-- (analyst confirmed fraud). Trust deltas follow TrustScoreService.D38:
--   approved/not-fraud → HIGH −5 / MED −1   ;   rejected/fraud → HIGH −10 / MED −3.
-- picks is MATERIALIZED so each random() is evaluated once PER ROW and frozen;
-- an inline / lateral random() here gets re-rolled per reference (inconsistent
-- rows) or computed once for the whole query (all rows identical status).
WITH ana AS (
  SELECT array_agg(id ORDER BY email) AS ids
  FROM users WHERE role = 'ANALYST' AND email LIKE '%@seed.payzo.tn'
),
picks AS MATERIALIZED (
  SELECT
    tx.id          AS tx_id,
    tx.risk_level  AS risk_level,
    tx.created_at  AS created_at,
    CASE
      WHEN random() < 0.60 THEN 'VALIDATED'
      WHEN random() < 0.85 THEN 'PENDING'
      ELSE 'REJECTED'
    END            AS status_val,
    (random() < 0.5)::int      AS ana_idx,   -- 0/1 → which seeded analyst
    floor(random()*3)::int     AS cmt_idx    -- 0..2 → which comment variant
  FROM transactions tx
  WHERE tx.status = 'SUSPENDED_PENDING_ANALYST'
    AND tx.reference LIKE 'TRX-S-%'
)
INSERT INTO fraud_alerts (
  id, transaction_id, analyst_id, status, ml_reasons,
  analyst_comment, trust_delta, created_at, decided_at
)
SELECT
  gen_random_uuid(),
  p.tx_id,
  CASE WHEN p.status_val = 'PENDING' THEN NULL ELSE ana.ids[1 + p.ana_idx] END,
  p.status_val,
  ARRAY[
    'Amount exceeds 10,000 TND — high-value transfer',
    'Initiated outside daytime hours (06:00–22:00)',
    'Transfer amount is a large share of the sender''s available balance'
  ],
  CASE p.status_val
    WHEN 'VALIDATED' THEN (ARRAY[
        'Verified with the client by phone — legitimate recurring transfer, released.',
        'Known beneficiary, sender confirmed the transfer. Not fraud.',
        'Pattern matches the sender''s history after review — released.'
      ])[1 + p.cmt_idx]
    WHEN 'REJECTED' THEN (ARRAY[
        'Sender confirmed they did not initiate this transfer — fraud.',
        'Recipient could not be verified; funds held as a precaution.',
        'Confirmed fraudulent after review — transfer blocked.'
      ])[1 + p.cmt_idx]
    ELSE NULL
  END,
  CASE p.status_val
    WHEN 'VALIDATED' THEN CASE WHEN p.risk_level = 'HIGH' THEN -5  ELSE -1 END
    WHEN 'REJECTED'  THEN CASE WHEN p.risk_level = 'HIGH' THEN -10 ELSE -3 END
    ELSE NULL
  END,
  p.created_at + INTERVAL '5 minutes',
  CASE WHEN p.status_val IN ('VALIDATED','REJECTED')
       THEN p.created_at + INTERVAL '20 minutes' ELSE NULL END
FROM picks p
CROSS JOIN ana
ON CONFLICT (transaction_id) DO NOTHING;

-- ── 4b. Bell-dropdown notifications for the SA ─────────────────────────
INSERT INTO user_notifications (id, user_id, title, message, type, is_read, created_at)
SELECT gen_random_uuid(), sa.id, n.title, n.message, n.type, n.is_read, n.created_at
FROM (SELECT id FROM users WHERE role = 'SUPERADMIN' LIMIT 1) sa
CROSS JOIN (VALUES
  ('Threshold report submitted',    'Analyst Tarek Sassi proposed new ML thresholds (LOW=0.28, HIGH=0.65). Awaiting review.', 'ANALYST_THRESHOLD_REPORT', false, NOW() - INTERVAL '4 minutes'),
  ('Client blocked',                 'Mariem Gharbi (CIN 10000006) was blocked by Admin Mohamed Khelifi.',                    'CLIENT_BLOCKED',           false, NOW() - INTERVAL '21 minutes'),
  ('New analyst joined',             'Nadia Trabelsi joined the analyst team.',                                                'COLLEAGUE_JOINED',         false, NOW() - INTERVAL '2 hours'),
  ('ML backup back online',          'Backup ML model has recovered. Active layer is now BACKUP.',                             'ML_BACKUP_UP',             false, NOW() - INTERVAL '6 hours'),
  ('Bank added',                     'New bank "BTE — Banque Tunisienne d''Échange" was added by Admin Fatma Ben Ali.',         'BANK_ADDED',               true,  NOW() - INTERVAL '1 day'),
  ('Admin created',                  'Admin Fatma Ben Ali was added by Super Admin.',                                          'ADMIN_CREATED',            true,  NOW() - INTERVAL '2 days'),
  ('Client unblocked',               'Hamdi Touati (CIN 10000007) was unblocked by Admin Mohamed Khelifi.',                    'CLIENT_UNBLOCKED',         true,  NOW() - INTERVAL '3 days'),
  ('Analyst created',                'Analyst Tarek Sassi was added by Super Admin.',                                          'ANALYST_CREATED',          true,  NOW() - INTERVAL '5 days'),
  ('Colleague left',                 'Admin Slim Bouzid has left the team.',                                                   'COLLEAGUE_LEFT',           true,  NOW() - INTERVAL '12 days')
) AS n(title, message, type, is_read, created_at);

-- ── 4c. ML threshold proposals (Analyst → SuperAdmin queue) ────────────
-- read_at IS NULL ⇒ unread / pending in the SA "Threshold proposals" panel.
-- The first one mirrors the "Threshold report submitted" bell notification.
DO $$
DECLARE
  ana1 UUID;  -- Tarek Sassi
  ana2 UUID;  -- Nadia Trabelsi
BEGIN
  SELECT id INTO ana1 FROM users WHERE email = 'tarek.sassi@seed.payzo.tn';
  SELECT id INTO ana2 FROM users WHERE email = 'nadia.trabelsi@seed.payzo.tn';
  IF ana1 IS NULL THEN RETURN; END IF;

  INSERT INTO ml_threshold_reports (
    id, analyst_id, suggested_low_medium, suggested_medium_high,
    description, justification, submitted_at, read_at
  ) VALUES
    (gen_random_uuid(), ana1, 0.280, 0.650,
     'Raise the LOW→MEDIUM cutoff to reduce false positives on routine large transfers.',
     'Most MEDIUM alerts just above the current 0.20 cutoff over the past two weeks were cleared as legitimate — routine large transfers from long-standing clients. Moving the LOW→MEDIUM cutoff to 0.28 should cut this review noise while keeping genuine fraud, which consistently scored well above 0.35, untouched.',
     NOW() - INTERVAL '4 minutes', NULL),
    (gen_random_uuid(), ana2, 0.300, 0.700,
     'Tighten the MEDIUM→HIGH cutoff to auto-suspend more high-value night transfers.',
     'Several confirmed-fraud cases last month scored between 0.66 and 0.70 and were only caught on manual review. Lowering the HIGH cutoff to 0.70 would auto-suspend them at scoring time instead of relying on the analyst queue.',
     NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days');
END $$;

-- ── 4d. Audit log (Super Admin "Audit Log" page + analyst decision history) ─
-- Spread across actions, actors, and roles. Every row carries a "_seed":true
-- marker in metadata so section 0 can wipe exactly these on re-run.
DO $$
DECLARE
  sa_id UUID; adm1 UUID; adm2 UUID; ana1 UUID; ana2 UUID;
  alert_v1 UUID; alert_v2 UUID; alert_r1 UUID;
BEGIN
  SELECT id INTO sa_id FROM users WHERE role = 'SUPERADMIN' LIMIT 1;
  SELECT id INTO adm1 FROM users WHERE email = 'mohamed.khelifi@seed.payzo.tn';
  SELECT id INTO adm2 FROM users WHERE email = 'fatma.benali@seed.payzo.tn';
  SELECT id INTO ana1 FROM users WHERE email = 'tarek.sassi@seed.payzo.tn';
  SELECT id INTO ana2 FROM users WHERE email = 'nadia.trabelsi@seed.payzo.tn';
  SELECT id INTO alert_v1 FROM fraud_alerts WHERE status = 'VALIDATED' ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO alert_v2 FROM fraud_alerts WHERE status = 'VALIDATED' ORDER BY created_at DESC OFFSET 1 LIMIT 1;
  SELECT id INTO alert_r1 FROM fraud_alerts WHERE status = 'REJECTED'  ORDER BY created_at DESC LIMIT 1;

  INSERT INTO audit_logs (id, actor_id, actor_role, action, target_type, target_id, metadata, created_at) VALUES
    -- SuperAdmin: staff lifecycle
    (gen_random_uuid(), sa_id, 'SUPERADMIN','USER_CREATED','USER', adm1, '{"_seed":true,"name":"Mohamed Khelifi","role":"ADMIN"}',   NOW()-INTERVAL '60 days'),
    (gen_random_uuid(), sa_id, 'SUPERADMIN','USER_CREATED','USER', adm2, '{"_seed":true,"name":"Fatma Ben Ali","role":"ADMIN"}',     NOW()-INTERVAL '55 days'),
    (gen_random_uuid(), sa_id, 'SUPERADMIN','USER_CREATED','USER', ana1, '{"_seed":true,"name":"Tarek Sassi","role":"ANALYST"}',     NOW()-INTERVAL '50 days'),
    (gen_random_uuid(), sa_id, 'SUPERADMIN','USER_CREATED','USER', ana2, '{"_seed":true,"name":"Nadia Trabelsi","role":"ANALYST"}',  NOW()-INTERVAL '45 days'),
    -- Admins: client lifecycle
    (gen_random_uuid(), adm1, 'ADMIN','CLIENT_APPROVED','USER', (SELECT id FROM users WHERE email='ines.kacem@seed.payzo.tn'),   '{"_seed":true,"client":"Ines Kacem","cin":"10000010"}',  NOW()-INTERVAL '180 days'),
    (gen_random_uuid(), adm1, 'ADMIN','CLIENT_APPROVED','USER', (SELECT id FROM users WHERE email='ahmed.dridi@seed.payzo.tn'),  '{"_seed":true,"client":"Ahmed Dridi","cin":"10000011"}', NOW()-INTERVAL '170 days'),
    (gen_random_uuid(), adm2, 'ADMIN','CLIENT_APPROVED','USER', (SELECT id FROM users WHERE email='maya.fendri@seed.payzo.tn'),  '{"_seed":true,"client":"Maya Fendri","cin":"10000022"}', NOW()-INTERVAL '60 days'),
    (gen_random_uuid(), adm1, 'ADMIN','CLIENT_REJECTED','USER', (SELECT id FROM users WHERE email='rim.jelassi@seed.payzo.tn'),  '{"_seed":true,"client":"Rim Jelassi","reason":"Identity could not be verified against CBS"}', NOW()-INTERVAL '210 days'),
    (gen_random_uuid(), adm1, 'ADMIN','CLIENT_BLOCKED','USER',  (SELECT id FROM users WHERE email='mariem.gharbi@seed.payzo.tn'),'{"_seed":true,"client":"Mariem Gharbi","reason":"Suspicious transaction patterns flagged by analyst"}', NOW()-INTERVAL '20 days'),
    (gen_random_uuid(), adm2, 'ADMIN','CLIENT_BLOCKED','USER',  (SELECT id FROM users WHERE email='hamdi.touati@seed.payzo.tn'), '{"_seed":true,"client":"Hamdi Touati","reason":"Multiple failed verification attempts"}', NOW()-INTERVAL '15 days'),
    -- Analysts: fraud-alert decisions (also feeds the analyst decision-history page)
    (gen_random_uuid(), ana1, 'ANALYST','ALERT_APPROVED','FRAUD_ALERT', alert_v1, '{"_seed":true,"outcome":"not_fraud"}',       NOW()-INTERVAL '3 days'),
    (gen_random_uuid(), ana1, 'ANALYST','ALERT_REJECTED','FRAUD_ALERT', alert_r1, '{"_seed":true,"outcome":"fraud_confirmed"}', NOW()-INTERVAL '2 days'),
    (gen_random_uuid(), ana2, 'ANALYST','ALERT_APPROVED','FRAUD_ALERT', alert_v2, '{"_seed":true,"outcome":"not_fraud"}',       NOW()-INTERVAL '1 days'),
    -- SuperAdmin: ML config + bank catalogue
    (gen_random_uuid(), sa_id, 'SUPERADMIN','ML_THRESHOLD_UPDATED','ML_CONFIG', NULL, '{"_seed":true,"low_medium":"0.30","medium_high":"0.80"}', NOW()-INTERVAL '4 days'),
    (gen_random_uuid(), sa_id, 'SUPERADMIN','BANK_ACTIVATED','BANK',   NULL, '{"_seed":true,"bank":"Amen Bank","code":"AMEN"}', NOW()-INTERVAL '8 days'),
    (gen_random_uuid(), sa_id, 'SUPERADMIN','BANK_DEACTIVATED','BANK', NULL, '{"_seed":true,"bank":"Union Internationale de Banques","code":"UIB"}', NOW()-INTERVAL '6 days');
END $$;

-- ── 5. Summary ─────────────────────────────────────────────────────────
DO $$
DECLARE
  c_admin INT;
  c_analyst INT;
  c_client_pending INT;
  c_client_accepted_derived INT;
  c_client_active INT;
  c_client_blocked INT;
  c_client_rejected INT;
  c_tx INT;
  c_tx_today INT;
  c_alerts_v INT;
  c_alerts_p INT;
  c_alerts_r INT;
  c_audit INT;
  c_reports INT;
BEGIN
  SELECT count(*) INTO c_admin   FROM users WHERE role = 'ADMIN'   AND email LIKE '%@seed.payzo.tn';
  SELECT count(*) INTO c_analyst FROM users WHERE role = 'ANALYST' AND email LIKE '%@seed.payzo.tn';
  SELECT count(*) INTO c_client_pending  FROM users WHERE role = 'CLIENT' AND status = 'PENDING' AND email LIKE '%@seed.payzo.tn';
  SELECT count(*) INTO c_client_accepted_derived FROM users
    WHERE role = 'CLIENT' AND status IN ('ACTIVE','BLOCKED') AND first_login_completed = false AND email LIKE '%@seed.payzo.tn';
  SELECT count(*) INTO c_client_active FROM users
    WHERE role = 'CLIENT' AND status = 'ACTIVE' AND first_login_completed = true AND email LIKE '%@seed.payzo.tn';
  SELECT count(*) INTO c_client_blocked  FROM users WHERE role = 'CLIENT' AND status = 'BLOCKED'  AND email LIKE '%@seed.payzo.tn';
  SELECT count(*) INTO c_client_rejected FROM users WHERE role = 'CLIENT' AND status = 'REJECTED' AND email LIKE '%@seed.payzo.tn';
  SELECT count(*) INTO c_tx       FROM transactions WHERE reference LIKE 'TRX-S-%';
  SELECT count(*) INTO c_tx_today FROM transactions WHERE reference LIKE 'TRX-S-T%';
  SELECT count(*) INTO c_alerts_v FROM fraud_alerts WHERE status = 'VALIDATED';
  SELECT count(*) INTO c_alerts_p FROM fraud_alerts WHERE status = 'PENDING';
  SELECT count(*) INTO c_alerts_r FROM fraud_alerts WHERE status = 'REJECTED';
  SELECT count(*) INTO c_audit    FROM audit_logs WHERE metadata LIKE '%"_seed":true%';
  SELECT count(*) INTO c_reports  FROM ml_threshold_reports WHERE analyst_id IN (SELECT id FROM users WHERE email LIKE '%@seed.payzo.tn');
  RAISE NOTICE 'Seed summary — admins=%, analysts=%, clients[pending=%, accepted_derived=%, active=%, blocked=%, rejected=%], tx=%, tx_today=%, alerts[validated=%, pending=%, rejected=%], audit_logs=%, threshold_reports=%',
    c_admin, c_analyst,
    c_client_pending, c_client_accepted_derived, c_client_active, c_client_blocked, c_client_rejected,
    c_tx, c_tx_today, c_alerts_v, c_alerts_p, c_alerts_r, c_audit, c_reports;
END $$;
