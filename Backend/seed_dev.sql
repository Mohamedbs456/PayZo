-- Dev-only seed data for the dashboard + clients page. Idempotent: re-running
-- wipes the rows it owns (`TRX-S-%` transactions, `@payzo.tn` test users) and
-- recreates them, so the schema stays predictable.
--
-- Run from host:  docker exec -i postgres-db psql -U payzo_user -d payzo_db < Backend/seed_dev.sql
--
-- Volume: 2 admins, 2 analysts, 30 clients (mixed statuses across the 5
-- enum values so the Clients page tabs each have content), ~3500 transactions
-- over the last 365 days, plus a denser "today" block (30 transactions spread
-- across hours so the 1D view of charts has something to bucket).

\set ON_ERROR_STOP on

-- ── 0. Wipe previous seed (idempotency) ────────────────────────────────
-- Order matters: transactions/alerts → users (FK chain isn't enforced here,
-- but transactions carry client_id pointing to users; clear them first so the
-- subsequent client DELETE doesn't trip).
DELETE FROM fraud_alerts WHERE transaction_id IN (SELECT id FROM transactions WHERE reference LIKE 'TRX-S-%');
DELETE FROM transactions WHERE reference LIKE 'TRX-S-%';
-- Bell-dropdown seed lives in user_notifications. Drop the SA's seeded rows
-- so re-running this script doesn't pile them up.
DELETE FROM user_notifications WHERE user_id IN (SELECT id FROM users WHERE role = 'SUPERADMIN');
DELETE FROM users WHERE email LIKE '%@payzo.tn' AND role IN ('CLIENT','ADMIN','ANALYST');

-- ── 1. Admins (2) and Analysts (2) ─────────────────────────────────────
-- Phone / governorate / address / DOB populated so the Staff Management
-- expanded panel has fields to render.
INSERT INTO users (
  id, email, first_name, last_name, phone, governorate, address, date_of_birth,
  role, status, first_login_completed, created_at, updated_at, username
)
VALUES
  (gen_random_uuid(), 'admin1@payzo.tn',   'Mohamed','Khelifi', '+21698123001','Tunis',   '12 Rue de la Liberté',     '1985-03-12','ADMIN',   'ACTIVE', true, NOW()-INTERVAL '60 days', NOW(), 'admin1'),
  (gen_random_uuid(), 'admin2@payzo.tn',   'Fatma',  'Ben Ali', '+21698123002','Sousse',  '8 Avenue de la République','1990-07-25','ADMIN',   'ACTIVE', true, NOW()-INTERVAL '55 days', NOW(), 'admin2'),
  (gen_random_uuid(), 'analyst1@payzo.tn', 'Tarek',  'Sassi',   '+21698123003','Sfax',    '22 Rue Ibn Khaldoun',      '1988-11-04','ANALYST', 'ACTIVE', true, NOW()-INTERVAL '50 days', NOW(), 'analyst1'),
  (gen_random_uuid(), 'analyst2@payzo.tn', 'Nadia',  'Trabelsi','+21698123004','Monastir','5 Avenue Bourguiba',       '1992-02-19','ANALYST', 'ACTIVE', true, NOW()-INTERVAL '45 days', NOW(), 'analyst2');

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
   WHERE role IN ('ADMIN','ANALYST') AND email LIKE '%@payzo.tn';
END $$;

-- ── 2. Clients (30, mixed statuses) ────────────────────────────────────
-- Status spread (so every Clients-page tab has content):
--   3 PENDING, 2 ACCEPTED-derived (status=ACTIVE, firstLogin=false),
--   2 BLOCKED, 2 REJECTED, 21 ACTIVE (firstLogin=true).
-- "ACCEPTED" is a derived UX state, not a real DB status — clients show as
-- ACCEPTED in the All tab when status=ACTIVE/BLOCKED AND firstLoginCompleted=false.
-- Address is populated for every row so the Clients-page expanded view has
-- something to show; decided_by/decided_at are filled in below in step 2b.
INSERT INTO users (
  id, email, first_name, last_name, cin, phone, governorate, address, date_of_birth,
  role, status, trust_score, first_login_completed,
  created_at, updated_at, username, default_account_id
)
VALUES
  -- PENDING (3) — fresh sign-ups awaiting an admin's decision.
  (gen_random_uuid(),'sara.mansouri@payzo.tn','Sara','Mansouri','10000001','+21621100001','Tunis','12 Avenue Habib Bourguiba, Apt 4','1995-03-14','CLIENT','PENDING',50,false,NOW()-INTERVAL '2 days',NOW(),'sara.m','100000000001'),
  (gen_random_uuid(),'karim.bouaziz@payzo.tn','Karim','Bouaziz','10000002','+21621100002','Sousse','27 Rue de la République','1992-11-02','CLIENT','PENDING',50,false,NOW()-INTERVAL '1 days',NOW(),'karim.b','100000000002'),
  (gen_random_uuid(),'yacine.laribi@payzo.tn','Yacine','Laribi','10000003','+21621100003','Sfax','5 Rue Mongi Slim','1988-07-22','CLIENT','PENDING',50,false,NOW()-INTERVAL '6 hours',NOW(),'yacine.l','100000000003'),

  -- ACCEPTED-derived (2) — admin approved, credentials sent, hasn't done first
  -- login yet. status=ACTIVE + firstLoginCompleted=false. Surfaces as ACCEPTED
  -- pill in the All tab; counted in the Accepted tab broad filter.
  (gen_random_uuid(),'amira.cherif@payzo.tn','Amira','Cherif','10000004','+21621100004','Monastir','Avenue Habib Bourguiba, Imm. Carthage, Apt 4','1997-01-09','CLIENT','ACTIVE',50,false,NOW()-INTERVAL '4 days',NOW(),'amira.c','100000000004'),
  (gen_random_uuid(),'walid.zoghlami@payzo.tn','Walid','Zoghlami','10000005','+21621100005','Bizerte','18 Rue Ibn Khaldoun','1990-05-18','CLIENT','ACTIVE',50,false,NOW()-INTERVAL '3 days',NOW(),'walid.z','100000000005'),

  -- BLOCKED (2) — previously active, suspended by an admin.
  (gen_random_uuid(),'mariem.gharbi@payzo.tn','Mariem','Gharbi','10000006','+21621100006','Nabeul','9 Avenue Farhat Hached','1986-09-30','CLIENT','BLOCKED',38,true,NOW()-INTERVAL '240 days',NOW(),'mariem.g','100000000006'),
  (gen_random_uuid(),'hamdi.touati@payzo.tn','Hamdi','Touati','10000007','+21621100007','Tunis','45 Rue de Marseille','1993-12-11','CLIENT','BLOCKED',42,true,NOW()-INTERVAL '225 days',NOW(),'hamdi.t','100000000007'),

  -- REJECTED (2) — admin denied the registration.
  (gen_random_uuid(),'rim.jelassi@payzo.tn','Rim','Jelassi','10000008','+21621100008','Mahdia','3 Rue Taïeb Mhiri','1999-04-25','CLIENT','REJECTED',50,false,NOW()-INTERVAL '210 days',NOW(),'rim.j','100000000008'),
  (gen_random_uuid(),'omar.belkadi@payzo.tn','Omar','Belkadi','10000009','+21621100009','Gabes','22 Avenue Mohamed V','1985-02-08','CLIENT','REJECTED',50,false,NOW()-INTERVAL '195 days',NOW(),'omar.b','100000000009'),

  -- ACTIVE (21) — happy path, full lifecycle, will get the bulk of transactions.
  (gen_random_uuid(),'ines.kacem@payzo.tn','Ines','Kacem','10000010','+21621100010','Kairouan','7 Rue Ali Belhouane','1991-06-17','CLIENT','ACTIVE',66,true,NOW()-INTERVAL '180 days',NOW(),'ines.k','100000000010'),
  (gen_random_uuid(),'ahmed.dridi@payzo.tn','Ahmed','Dridi','10000011','+21621100011','Tunis','14 Rue Jugurtha, Mutuelleville','1994-08-04','CLIENT','ACTIVE',73,true,NOW()-INTERVAL '170 days',NOW(),'ahmed.d','100000000011'),
  (gen_random_uuid(),'leila.ferchichi@payzo.tn','Leila','Ferchichi','10000012','+21621100012','Sousse','30 Avenue Hédi Chaker','1989-10-13','CLIENT','ACTIVE',62,true,NOW()-INTERVAL '160 days',NOW(),'leila.f','100000000012'),
  (gen_random_uuid(),'mehdi.saidi@payzo.tn','Mehdi','Saidi','10000013','+21621100013','Sfax','11 Rue Ibn Sina','1996-02-26','CLIENT','ACTIVE',54,true,NOW()-INTERVAL '150 days',NOW(),'mehdi.s','100000000013'),
  (gen_random_uuid(),'salma.bouazizi@payzo.tn','Salma','Bouazizi','10000014','+21621100014','Monastir','Route de la Corniche, Résidence El Manar','1987-12-01','CLIENT','ACTIVE',69,true,NOW()-INTERVAL '140 days',NOW(),'salma.b','100000000014'),
  (gen_random_uuid(),'ayoub.khlifi@payzo.tn','Ayoub','Khlifi','10000015','+21621100015','Bizerte','19 Rue d''Espagne','1998-03-20','CLIENT','ACTIVE',81,true,NOW()-INTERVAL '130 days',NOW(),'ayoub.k','100000000015'),
  (gen_random_uuid(),'nour.hammami@payzo.tn','Nour','Hammami','10000016','+21621100016','Nabeul','6 Rue de Tunis','1992-07-07','CLIENT','ACTIVE',70,true,NOW()-INTERVAL '120 days',NOW(),'nour.h','100000000016'),
  (gen_random_uuid(),'bilel.rouissi@payzo.tn','Bilel','Rouissi','10000017','+21621100017','Tunis','38 Avenue de la Liberté','1984-05-29','CLIENT','ACTIVE',45,true,NOW()-INTERVAL '110 days',NOW(),'bilel.r','100000000017'),
  (gen_random_uuid(),'syrine.hadj@payzo.tn','Syrine','Hadj','10000018','+21621100018','Mahdia','2 Rue de la Plage','1995-09-10','CLIENT','ACTIVE',77,true,NOW()-INTERVAL '100 days',NOW(),'syrine.h','100000000018'),
  (gen_random_uuid(),'firas.amri@payzo.tn','Firas','Amri','10000019','+21621100019','Gabes','10 Rue de Carthage','1990-11-23','CLIENT','ACTIVE',58,true,NOW()-INTERVAL '90 days',NOW(),'firas.a','100000000019'),
  (gen_random_uuid(),'eya.brahem@payzo.tn','Eya','Brahem','10000020','+21621100020','Kairouan','15 Rue Habib Thameur','1993-04-05','CLIENT','ACTIVE',65,true,NOW()-INTERVAL '80 days',NOW(),'eya.b','100000000020'),
  (gen_random_uuid(),'wassim.chaouch@payzo.tn','Wassim','Chaouch','10000021','+21621100021','Tunis','21 Rue de la Kasbah','1988-08-18','CLIENT','ACTIVE',52,true,NOW()-INTERVAL '70 days',NOW(),'wassim.c','100000000021'),
  (gen_random_uuid(),'maya.fendri@payzo.tn','Maya','Fendri','10000022','+21621100022','Sousse','40 Boulevard du 7 Novembre','2000-01-30','CLIENT','ACTIVE',83,true,NOW()-INTERVAL '60 days',NOW(),'maya.f','100000000022'),
  (gen_random_uuid(),'aymen.zaibi@payzo.tn','Aymen','Zaibi','10000023','+21621100023','Sfax','8 Rue Salah Ben Youssef','1986-06-12','CLIENT','ACTIVE',61,true,NOW()-INTERVAL '50 days',NOW(),'aymen.z','100000000023'),
  (gen_random_uuid(),'rania.mzoughi@payzo.tn','Rania','Mzoughi','10000024','+21621100024','Monastir','25 Avenue Bourguiba, Skanes','1991-10-24','CLIENT','ACTIVE',68,true,NOW()-INTERVAL '40 days',NOW(),'rania.m','100000000024'),
  (gen_random_uuid(),'sami.gaaloul@payzo.tn','Sami','Gaaloul','10000025','+21621100025','Bizerte','13 Rue de la Corniche','1989-02-15','CLIENT','ACTIVE',74,true,NOW()-INTERVAL '35 days',NOW(),'sami.g','100000000025'),
  (gen_random_uuid(),'lina.bourguiba@payzo.tn','Lina','Bourguiba','10000026','+21621100026','Nabeul','17 Rue Hannibal','1996-12-03','CLIENT','ACTIVE',79,true,NOW()-INTERVAL '30 days',NOW(),'lina.b','100000000026'),
  (gen_random_uuid(),'fares.dhaouadi@payzo.tn','Fares','Dhaouadi','10000027','+21621100027','Tunis','4 Rue d''Algérie','1983-07-19','CLIENT','ACTIVE',56,true,NOW()-INTERVAL '20 days',NOW(),'fares.d','100000000027'),
  (gen_random_uuid(),'asma.makni@payzo.tn','Asma','Makni','10000028','+21621100028','Mahdia','9 Rue Hédi Nouira','1997-05-08','CLIENT','ACTIVE',71,true,NOW()-INTERVAL '15 days',NOW(),'asma.m','100000000028'),
  (gen_random_uuid(),'hatem.naili@payzo.tn','Hatem','Naili','10000029','+21621100029','Gabes','16 Rue de Sfax','1985-09-27','CLIENT','ACTIVE',47,true,NOW()-INTERVAL '10 days',NOW(),'hatem.n','100000000029'),
  (gen_random_uuid(),'inesse.aouini@payzo.tn','Inesse','Aouini','10000030','+21621100030','Kairouan','23 Avenue Ibn El Jazzar','1994-11-14','CLIENT','ACTIVE',85,true,NOW()-INTERVAL '5 days',NOW(),'inesse.a','100000000030');

-- ── 2b. Lifecycle attribution ─────────────────────────────────────────
-- Link every non-PENDING client's `decided_by` / `decided_at` to admin1 so
-- the Clients-page expanded view can show "Accepted by · Admin · Mohamed Khelifi".
-- PENDING rows stay null (they haven't been decided yet, by definition).
DO $$
DECLARE
  admin1_id UUID;
BEGIN
  SELECT id INTO admin1_id FROM users WHERE email = 'admin1@payzo.tn';
  IF admin1_id IS NULL THEN RETURN; END IF;

  UPDATE users
     SET decided_by = admin1_id,
         decided_at = created_at + INTERVAL '4 hours'
   WHERE role = 'CLIENT'
     AND status IN ('ACCEPTED','ACTIVE','BLOCKED','REJECTED')
     AND email LIKE '%@payzo.tn';

  -- Sprinkle reasons on the BLOCKED / REJECTED rows so those expanded layouts
  -- (later iterations) have something to render.
  UPDATE users
     SET decision_reason = 'Suspicious transaction patterns flagged by analyst'
   WHERE role = 'CLIENT' AND status = 'BLOCKED' AND email LIKE '%@payzo.tn';

  UPDATE users
     SET decision_reason = 'Identity could not be verified against CBS'
   WHERE role = 'CLIENT' AND status = 'REJECTED' AND email LIKE '%@payzo.tn';
END $$;

-- ── 3. Transactions ─────────────────────────────────────────────────────
-- Two passes, both using ACTIVE clients only (PENDING / ACCEPTED / REJECTED
-- clients have no transaction history by definition; BLOCKED clients can have
-- old history from before they were blocked, but we keep the volume simple
-- and exclude them too):
--   Pass A — 3500 transactions over the last 365 days (so 30D and 1Y are
--            visually distinct from each other and 1Y has ~10× more area).
--   Pass B — 30 transactions specifically dated today, spread across
--            hours 06:00–22:00, so the 1D view (once we bucket hourly)
--            has actual hourly variation.
DO $$
DECLARE
  client_ids   UUID[];
  client_cins  TEXT[];
  bank_codes   TEXT[] := ARRAY['STB','ATB','BIAT','ZTB','AMEN','BTE','UIB'];
  n_clients    INT;
  n_banks      INT := array_length(bank_codes, 1);
  i            INT;
  c_id         UUID;
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
  -- Both arrays ordered by cin so client_ids[k] / client_cins[k] correspond.
  -- Restrict to status=ACTIVE AND firstLoginCompleted=true clients — fresh
  -- accepts (firstLogin=false) shouldn't have transactions yet, and PENDING /
  -- REJECTED rows obviously don't either.
  SELECT array_agg(id ORDER BY cin), array_agg(cin ORDER BY cin)
    INTO client_ids, client_cins
    FROM users
    WHERE role = 'CLIENT'
      AND status = 'ACTIVE'
      AND first_login_completed = true;
  IF client_ids IS NULL THEN
    RAISE NOTICE 'No first-logged-in ACTIVE CLIENT users found — abort.';
    RETURN;
  END IF;
  n_clients := array_length(client_ids, 1);

  -- Pass A — 3500 over 365 days
  FOR i IN 1..3500 LOOP
    c_id    := client_ids[((i - 1) % n_clients) + 1];
    -- Pick a different client as receiver so the backend's
    -- `resolveDestinationName` can produce a name on the list endpoint.
    dst_cin := client_cins[((i - 1 + 7) % n_clients) + 1];
    src_b := bank_codes[((i + floor(random() * n_banks)::int) % n_banks) + 1];
    dst_b := bank_codes[((i + floor(random() * n_banks)::int + 3) % n_banks) + 1];
    IF src_b = dst_b THEN
      dst_b := bank_codes[((array_position(bank_codes, dst_b) % n_banks) + 1)];
    END IF;
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
    risk_val := CASE
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
      lpad(floor(random() * 1e12)::bigint::text, 12, '0'),
      lpad(floor(random() * 1e12)::bigint::text, 12, '0'),
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
    dst_cin := client_cins[((i - 1 + 7) % n_clients) + 1];
    src_b := bank_codes[((i - 1) % n_banks) + 1];
    dst_b := bank_codes[((i + 3) % n_banks) + 1];
    IF src_b = dst_b THEN
      dst_b := bank_codes[((array_position(bank_codes, dst_b) % n_banks) + 1)];
    END IF;
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
      lpad(floor(random() * 1e12)::bigint::text, 12, '0'),
      lpad(floor(random() * 1e12)::bigint::text, 12, '0'),
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

-- ── 4. Fraud alerts ────────────────────────────────────────────────────
INSERT INTO fraud_alerts (id, transaction_id, status, created_at, decided_at, ml_reasons)
SELECT
  gen_random_uuid(),
  tx.id,
  pick.status_val,
  tx.created_at + INTERVAL '5 minutes',
  CASE
    WHEN pick.status_val IN ('VALIDATED','REJECTED')
      THEN tx.created_at + INTERVAL '20 minutes'
    ELSE NULL
  END,
  ARRAY['high_amount','unusual_pattern']
FROM transactions tx
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN random() < 0.6 THEN 'VALIDATED'
    WHEN random() < 0.85 THEN 'PENDING'
    ELSE 'REJECTED'
  END AS status_val
) pick
WHERE tx.status = 'SUSPENDED_PENDING_ANALYST'
ON CONFLICT (transaction_id) DO NOTHING;

-- ── 4b. Bell-dropdown notifications for the SA ─────────────────────────
-- Spread across the 9 SA-relevant types so the bell dropdown looks alive.
-- Mix of read / unread + recent / older timestamps.
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

-- ── 5. Summary ─────────────────────────────────────────────────────────
DO $$
DECLARE
  c_admin INT;
  c_analyst INT;
  c_client_pending INT;
  c_client_accepted_derived INT;  -- ACTIVE/BLOCKED + firstLogin=false (UX state)
  c_client_active INT;            -- ACTIVE + firstLogin=true (post first-login)
  c_client_blocked INT;
  c_client_rejected INT;
  c_tx INT;
  c_tx_today INT;
  c_alerts_v INT;
  c_alerts_p INT;
BEGIN
  SELECT count(*) INTO c_admin   FROM users WHERE role = 'ADMIN';
  SELECT count(*) INTO c_analyst FROM users WHERE role = 'ANALYST';
  SELECT count(*) INTO c_client_pending  FROM users WHERE role = 'CLIENT' AND status = 'PENDING';
  SELECT count(*) INTO c_client_accepted_derived FROM users
    WHERE role = 'CLIENT' AND status IN ('ACTIVE','BLOCKED') AND first_login_completed = false;
  SELECT count(*) INTO c_client_active FROM users
    WHERE role = 'CLIENT' AND status = 'ACTIVE' AND first_login_completed = true;
  SELECT count(*) INTO c_client_blocked  FROM users WHERE role = 'CLIENT' AND status = 'BLOCKED';
  SELECT count(*) INTO c_client_rejected FROM users WHERE role = 'CLIENT' AND status = 'REJECTED';
  SELECT count(*) INTO c_tx       FROM transactions;
  SELECT count(*) INTO c_tx_today FROM transactions WHERE created_at >= date_trunc('day', NOW());
  SELECT count(*) INTO c_alerts_v FROM fraud_alerts WHERE status = 'VALIDATED';
  SELECT count(*) INTO c_alerts_p FROM fraud_alerts WHERE status = 'PENDING';
  RAISE NOTICE 'Seed summary — admins=%, analysts=%, clients[pending=%, accepted_derived=%, active=%, blocked=%, rejected=%], tx=%, tx_today=%, fraud_validated=%, fraud_pending=%',
    c_admin, c_analyst,
    c_client_pending, c_client_accepted_derived, c_client_active, c_client_blocked, c_client_rejected,
    c_tx, c_tx_today, c_alerts_v, c_alerts_p;
END $$;
