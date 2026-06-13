-- CBS-side companion to seed_dev.sql. Creates CBS client + account records for
-- the 30 backoffice demo clients (CIN 10000001–10000030) so that backoffice
-- actions which touch the CBS — viewing a client's CBS identity, and especially
-- APPROVING a fraud alert (which executes a real CBS transfer) — succeed for the
-- seeded clients instead of throwing "CBS missing client for cin=…".
--
-- Run from host:  docker exec -i postgres-db psql -U cbs_user -d cbs_db < Backend/seed_dev_cbs.sql
--
-- IMPORTANT: cbs_db defaults to ddl-auto=create (wiped on every CBS boot). The
-- docker-compose.override.yml flips the CBS simulator to ddl-auto=update so these
-- rows survive `docker compose up`. Re-run this script after any `down -v`.
--
-- The account-number / bank mapping here is IDENTICAL to the helper functions in
-- seed_dev.sql, so a seeded transaction's source/dest account numbers match the
-- accounts created here.

\set ON_ERROR_STOP on

-- Shared deterministic mapping: CIN → bank (numeric + alpha) → 20-digit account.
CREATE OR REPLACE FUNCTION seed_bank_alpha(cin text) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT (ARRAY['STB','ATB','BIAT','ZTB','AMEN','BTE','UIB'])[(cin::bigint % 7)::int + 1] $$;
CREATE OR REPLACE FUNCTION seed_bank_num(cin text) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT (ARRAY['10','04','08','25','07','11','12'])[(cin::bigint % 7)::int + 1] $$;
CREATE OR REPLACE FUNCTION seed_acct(cin text) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT seed_bank_num(cin) || '001' || lpad(cin, 13, '0') || '00' $$;

-- ── 0. Wipe previous backoffice-demo CBS rows (idempotency) ─────────────
DELETE FROM cbs_transactions WHERE account_number IN
  (SELECT account_number FROM cbs_accounts WHERE client_cin BETWEEN '10000001' AND '10000030');
DELETE FROM cbs_accounts WHERE client_cin BETWEEN '10000001' AND '10000030';
DELETE FROM cbs_clients  WHERE cin        BETWEEN '10000001' AND '10000030';

-- ── 1. CBS clients (mirror seed_dev.sql identities by CIN) ──────────────
INSERT INTO cbs_clients (cin, first_name, last_name, email, phone, date_of_birth, address, governorate) VALUES
  ('10000001','Sara','Mansouri','sara.mansouri@gmail.com','+21610000001','1995-03-14','12 Avenue Habib Bourguiba','Tunis'),
  ('10000002','Karim','Bouaziz','karim.bouaziz@gmail.com','+21610000002','1992-11-02','27 Rue de la République','Sousse'),
  ('10000003','Yacine','Laribi','yacine.laribi@gmail.com','+21610000003','1988-07-22','5 Rue Mongi Slim','Sfax'),
  ('10000004','Amira','Cherif','amira.cherif@gmail.com','+21610000004','1997-01-09','Imm. Carthage, Apt 4','Monastir'),
  ('10000005','Walid','Zoghlami','walid.zoghlami@gmail.com','+21610000005','1990-05-18','18 Rue Ibn Khaldoun','Bizerte'),
  ('10000006','Mariem','Gharbi','mariem.gharbi@gmail.com','+21610000006','1986-09-30','9 Avenue Farhat Hached','Nabeul'),
  ('10000007','Hamdi','Touati','hamdi.touati@gmail.com','+21610000007','1993-12-11','45 Rue de Marseille','Tunis'),
  ('10000008','Rim','Jelassi','rim.jelassi@gmail.com','+21610000008','1999-04-25','3 Rue Taïeb Mhiri','Mahdia'),
  ('10000009','Omar','Belkadi','omar.belkadi@gmail.com','+21610000009','1985-02-08','22 Avenue Mohamed V','Gabes'),
  ('10000010','Ines','Kacem','ines.kacem@gmail.com','+21610000010','1991-06-17','7 Rue Ali Belhouane','Kairouan'),
  ('10000011','Ahmed','Dridi','ahmed.dridi@gmail.com','+21610000011','1994-08-04','14 Rue Jugurtha','Tunis'),
  ('10000012','Leila','Ferchichi','leila.ferchichi@gmail.com','+21610000012','1989-10-13','30 Avenue Hédi Chaker','Sousse'),
  ('10000013','Mehdi','Saidi','mehdi.saidi@gmail.com','+21610000013','1996-02-26','11 Rue Ibn Sina','Sfax'),
  ('10000014','Salma','Bouazizi','salma.bouazizi@gmail.com','+21610000014','1987-12-01','Résidence El Manar','Monastir'),
  ('10000015','Ayoub','Khlifi','ayoub.khlifi@gmail.com','+21610000015','1998-03-20','19 Rue d''Espagne','Bizerte'),
  ('10000016','Nour','Hammami','nour.hammami@gmail.com','+21610000016','1992-07-07','6 Rue de Tunis','Nabeul'),
  ('10000017','Bilel','Rouissi','bilel.rouissi@gmail.com','+21610000017','1984-05-29','38 Avenue de la Liberté','Tunis'),
  ('10000018','Syrine','Hadj','syrine.hadj@gmail.com','+21610000018','1995-09-10','2 Rue de la Plage','Mahdia'),
  ('10000019','Firas','Amri','firas.amri@gmail.com','+21610000019','1990-11-23','10 Rue de Carthage','Gabes'),
  ('10000020','Eya','Brahem','eya.brahem@gmail.com','+21610000020','1993-04-05','15 Rue Habib Thameur','Kairouan'),
  ('10000021','Wassim','Chaouch','wassim.chaouch@gmail.com','+21610000021','1988-08-18','21 Rue de la Kasbah','Tunis'),
  ('10000022','Maya','Fendri','maya.fendri@gmail.com','+21610000022','2000-01-30','40 Boulevard du 7 Novembre','Sousse'),
  ('10000023','Aymen','Zaibi','aymen.zaibi@gmail.com','+21610000023','1986-06-12','8 Rue Salah Ben Youssef','Sfax'),
  ('10000024','Rania','Mzoughi','rania.mzoughi@gmail.com','+21610000024','1991-10-24','25 Avenue Bourguiba','Monastir'),
  ('10000025','Sami','Gaaloul','sami.gaaloul@gmail.com','+21610000025','1989-02-15','13 Rue de la Corniche','Bizerte'),
  ('10000026','Lina','Bourguiba','lina.bourguiba@gmail.com','+21610000026','1996-12-03','17 Rue Hannibal','Nabeul'),
  ('10000027','Fares','Dhaouadi','fares.dhaouadi@gmail.com','+21610000027','1983-07-19','4 Rue d''Algérie','Tunis'),
  ('10000028','Asma','Makni','asma.makni@gmail.com','+21610000028','1997-05-08','9 Rue Hédi Nouira','Mahdia'),
  ('10000029','Hatem','Naili','hatem.naili@gmail.com','+21610000029','1985-09-27','16 Rue de Sfax','Gabes'),
  ('10000030','Inesse','Aouini','inesse.aouini@gmail.com','+21610000030','1994-11-14','23 Avenue Ibn El Jazzar','Kairouan')
ON CONFLICT (cin) DO NOTHING;

-- ── 2. One funded CHECKING account per client ───────────────────────────
-- Balance 84k–204k TND — comfortably above any seeded transfer amount so an
-- analyst can approve seeded fraud alerts without hitting INSUFFICIENT_BALANCE.
INSERT INTO cbs_accounts (account_number, client_cin, bank_code, type, balance, opened_at)
SELECT
  seed_acct(cin),
  cin,
  seed_bank_alpha(cin),
  'CHECKING',
  (80000 + (right(cin,2)::int * 4137))::numeric(15,2),
  DATE '2022-01-01' + (right(cin,2)::int)
FROM cbs_clients
WHERE cin BETWEEN '10000001' AND '10000030'
ON CONFLICT (account_number) DO NOTHING;

-- ── 3. Summary ─────────────────────────────────────────────────────────
DO $$
DECLARE c_cli INT; c_acc INT;
BEGIN
  SELECT count(*) INTO c_cli FROM cbs_clients  WHERE cin        BETWEEN '10000001' AND '10000030';
  SELECT count(*) INTO c_acc FROM cbs_accounts WHERE client_cin BETWEEN '10000001' AND '10000030';
  RAISE NOTICE 'CBS seed summary — backoffice clients=%, accounts=%', c_cli, c_acc;
END $$;
