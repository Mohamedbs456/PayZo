package com.payzo.backend.config;

import com.payzo.backend.cbs.entity.AccountType;
import com.payzo.backend.cbs.entity.CbsAccount;
import com.payzo.backend.cbs.entity.CbsClient;
import com.payzo.backend.cbs.repository.CbsAccountRepository;
import com.payzo.backend.cbs.repository.CbsClientRepository;
import com.payzo.backend.domain.entity.Beneficiary;
import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.entity.Transaction;
import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.domain.enums.TransactionStatus;
import com.payzo.backend.domain.enums.UserStatus;
import com.payzo.backend.repository.BeneficiaryRepository;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.repository.TransactionRepository;
import com.payzo.backend.service.integration.KeycloakAdminService;
import com.payzo.backend.util.RibMinter;
import com.payzo.backend.util.TransactionReferenceGenerator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

/**
 * Pre-stages deterministic demo profiles for the PFE jury defense. When
 * enabled via {@code payzo.demo.seed.enabled=true} (set in
 * {@code application-dev.yml}), this service runs once at startup and creates:
 *
 * <ul>
 *   <li><b>3 sender profiles</b> — Ahmed (student-shape), Karim (business-shape),
 *       Leila (coffee-shop high-velocity).</li>
 *   <li><b>3 PayZo-resident recipients</b> — Sarra (friend), Mohamed (office
 *       rent), Mounir (supplier). Saved as beneficiaries of the right sender
 *       with appropriate {@code transferCount} and {@code lastUsedAt}.</li>
 *   <li><b>1 CBS-only mule</b> — Inconnu Receveur. No PayZo registration; this
 *       is the destination the demo presenter types manually to trigger
 *       fraud scenarios.</li>
 *   <li><b>30-day APPROVED transaction backlog</b> — sized + distributed per
 *       archetype so the per-user-norm features the model reads at scoring
 *       time produce deterministic risk scores for the demo actions.</li>
 * </ul>
 *
 * Idempotent — re-running on an already-seeded DB is a no-op.
 *
 * <p>Runs on {@link ApplicationReadyEvent} (not {@code @PostConstruct}) so it
 * fires <em>after</em> {@code BankSyncBootstrap} populates the local
 * {@code banks} table from CBS. The actual RIB minting reads bank numeric
 * codes directly from the CBS datasource, so we don't depend on the sync
 * order strictly — but the recipient transfer-resolution path on the demo
 * day does need {@code banks.is_active=true} for the sender's bank.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DemoSeedService {

    // ── Demo CINs (kept in the 99000... range to avoid collision with seeded
    //    Tunisian-name dataset which uses random 10M-99M CINs). ──────────────
    private static final String STUDENT_CIN     = "99000001";
    private static final String BUSINESS_CIN    = "99000002";
    private static final String COFFEESHOP_CIN  = "99000003";
    private static final String FRIEND_CIN      = "99000004";
    private static final String OFFICE_CIN      = "99000005";
    private static final String SUPPLIER_CIN    = "99000006";
    private static final String MULE_CIN        = "99000099";

    /** Demo password — 13 chars to clear the Keycloak realm policy
     *  (length≥12, upper, lower, digit, special — see util/PasswordPolicy.java).
     *  Easy enough to type during the demo: D-e-m-o-P-a-y-z-o-2-0-2-4-! */
    private static final String DEMO_PASSWORD = "DemoPayZo2024!";

    // ── CBS bank numeric codes (must match cbs-simulator DataInitializer). ──
    private static final String BANK_ATB  = "04";    // student + friend
    private static final String BANK_AMEN = "07";    // mule
    private static final String BANK_BIAT = "08";    // business + office
    private static final String BANK_STB  = "10";    // coffeeshop + supplier

    // Single-branch fiction.
    private static final String BRANCH = "001";

    /** Deterministic seed so re-running produces identical history. */
    private static final long RANDOM_SEED = 42_99_42L;

    // Realistic transfer motifs for seeded history (mostly blank, like real P2P transfers).
    private static final String[] HISTORY_MOTIFS = {
            null, null, null, null, null, null, "Remboursement", "Loyer", "Courses",
            "Merci", "Café", "Restaurant", "Cadeau", "Facture", "Essence", "Taxi"};

    // ── Hour-of-day weight tables per archetype (24 entries each). ──────────
    private static final double[] EVENING_HOURS = normalize(new double[]{
            0.005, 0.005, 0.003, 0.002, 0.002, 0.003,    // 00-05
            0.010, 0.020, 0.025, 0.030, 0.035, 0.040,    // 06-11
            0.045, 0.040, 0.035, 0.040, 0.050, 0.065,    // 12-17
            0.090, 0.110, 0.120, 0.110, 0.080, 0.035,    // 18-23 ← peak
    });
    private static final double[] BUSINESS_HOURS = normalize(new double[]{
            0.005, 0.005, 0.005, 0.005, 0.005, 0.005,    // 00-05
            0.025, 0.045, 0.065, 0.075, 0.080, 0.085,    // 06-11
            0.080, 0.065, 0.055, 0.060, 0.070, 0.075,    // 12-17
            0.075, 0.060, 0.045, 0.025, 0.015, 0.010,    // 18-23
    });

    // ── Dependencies. ───────────────────────────────────────────────────────
    private final ClientRepository clientRepository;
    private final BeneficiaryRepository beneficiaryRepository;
    private final TransactionRepository transactionRepository;
    private final CbsClientRepository cbsClientRepository;
    private final CbsAccountRepository cbsAccountRepository;
    private final KeycloakAdminService keycloakAdminService;
    private final TransactionReferenceGenerator referenceGenerator;

    @Value("${payzo.demo.seed.enabled:false}")
    private boolean enabled;

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void seed() {
        if (!enabled) {
            log.debug("DemoSeedService: payzo.demo.seed.enabled=false — skipping");
            return;
        }

        boolean payzoExists = clientRepository.findByCin(STUDENT_CIN).isPresent();
        boolean cbsExists   = cbsClientRepository.findByCin(STUDENT_CIN).isPresent();

        if (payzoExists && cbsExists) {
            log.info("DemoSeedService: demo profiles already seeded — skipping");
            return;
        }

        // CBS simulator uses ddl-auto=create, so its tables are wiped on every
        // restart while payzo_db persists across restarts (ddl-auto=update).
        // When that happens, PayZo + Keycloak records are intact but the CBS
        // clients/accounts are gone — just re-create the CBS layer.
        if (payzoExists) {
            log.warn("DemoSeedService: PayZo records intact but CBS records missing "
                    + "(CBS simulator restarted?) — re-seeding CBS layer only");
            reseedCbs();
            return;
        }

        log.info("DemoSeedService: seeding 3 senders + 3 recipients + 1 mule + 30-day history");

        // ── 1. Create the seven CBS+PayZo identities. ─────────────────────
        DemoUser student    = createPayZoUser(STUDENT_CIN,    "Ahmed",   "Ben Salem", "Tunis",
                                              BANK_ATB,  1_001L, 400, new BigDecimal("8000.00"),  85);
        DemoUser business   = createPayZoUser(BUSINESS_CIN,   "Karim",   "Trabelsi",  "Sfax",
                                              BANK_BIAT, 2_001L, 900, new BigDecimal("120000.00"), 82);
        DemoUser coffeeshop = createPayZoUser(COFFEESHOP_CIN, "Leila",   "Mejri",     "Sousse",
                                              BANK_STB,  3_001L, 1100, new BigDecimal("50000.00"), 80);
        DemoUser friend     = createPayZoUser(FRIEND_CIN,     "Sarra",   "Hammami",   "Tunis",
                                              BANK_ATB,  4_001L, 400, new BigDecimal("3000.00"),  80);
        DemoUser office     = createPayZoUser(OFFICE_CIN,     "Mohamed", "Sfar",      "Sfax",
                                              BANK_BIAT, 5_001L, 900, new BigDecimal("50000.00"), 85);
        DemoUser supplier   = createPayZoUser(SUPPLIER_CIN,   "Mounir",  "Karoui",    "Sousse",
                                              BANK_STB,  6_001L, 1100, new BigDecimal("20000.00"), 75);

        // Mule has a CBS account so the demo presenter can target it by RIB,
        // but no PayZo Client + no Keycloak user — the destination resolves
        // as "external CBS recipient" at transfer time, which is exactly the
        // "unknown recipient" signal the model needs to flag.
        String muleRib = createMule();

        // ── 2. Saved beneficiaries (a single one each — enough to drive the
        //       isKnownBeneficiary + transfersToDestLifetime + dest_familiarity
        //       features for the legit-path demo actions). ──────────────────
        OffsetDateTime now = OffsetDateTime.now();
        createBeneficiary(student.client,    friend.rib,    friend.firstName,    friend.lastName,    "Sarra (friend)",       12, now.minusDays(3));
        createBeneficiary(business.client,   office.rib,    office.firstName,    office.lastName,    "Office Rent SARL",     20, now.minusDays(2));
        createBeneficiary(coffeeshop.client, supplier.rib,  supplier.firstName,  supplier.lastName,  "Sousse Coffee Beans",  50, now.minusDays(1));

        // ── 3. 30-day APPROVED transaction backlog. Per archetype: count,
        //       lognormal (μ, σ) for amounts, hour distribution, rotating
        //       destinations including the saved one so transfers_to_dest is
        //       realistic. Random seeded for repeatability. ────────────────
        Random rng = new Random(RANDOM_SEED);
        seedHistory(rng, student,
                /*count*/ 15,  /*amount μ*/ 4.5, /*σ*/ 0.6,
                EVENING_HOURS, friend.rib, /*alt dests*/ 4);
        seedHistory(rng, business,
                /*count*/ 80,  /*amount μ*/ 7.5, /*σ*/ 1.2,
                BUSINESS_HOURS, office.rib, /*alt dests*/ 24);
        seedHistory(rng, coffeeshop,
                /*count*/ 600, /*amount μ*/ 5.0, /*σ*/ 0.8,
                BUSINESS_HOURS, supplier.rib, /*alt dests*/ 59);

        log.info("DemoSeedService: done. Demo recipient RIBs — "
                + "friend={} office={} supplier={} MULE={}",
                friend.rib, office.rib, supplier.rib, muleRib);
    }

    // ─────────────────────────────────────────────────────────────────────
    // User + account creation
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Re-creates only the CBS clients + accounts for all demo identities.
     * Called when PayZo + Keycloak records are still intact but the CBS
     * simulator restarted with ddl-auto=create and wiped cbs_db.
     */
    private void reseedCbs() {
        seedCbsClientAndAccount(STUDENT_CIN,    "Ahmed",   "Ben Salem", "Tunis",
                                BANK_ATB,  1_001L, 400, new BigDecimal("8000.00"));
        seedCbsClientAndAccount(BUSINESS_CIN,   "Karim",   "Trabelsi",  "Sfax",
                                BANK_BIAT, 2_001L, 900, new BigDecimal("120000.00"));
        seedCbsClientAndAccount(COFFEESHOP_CIN, "Leila",   "Mejri",     "Sousse",
                                BANK_STB,  3_001L, 1100, new BigDecimal("50000.00"));
        seedCbsClientAndAccount(FRIEND_CIN,     "Sarra",   "Hammami",   "Tunis",
                                BANK_ATB,  4_001L, 400, new BigDecimal("3000.00"));
        seedCbsClientAndAccount(OFFICE_CIN,     "Mohamed", "Sfar",      "Sfax",
                                BANK_BIAT, 5_001L, 900, new BigDecimal("50000.00"));
        seedCbsClientAndAccount(SUPPLIER_CIN,   "Mounir",  "Karoui",    "Sousse",
                                BANK_STB,  6_001L, 1100, new BigDecimal("20000.00"));
        createMule();
        log.info("DemoSeedService: CBS layer re-seeded — demo login should work now");
    }

    /**
     * Ensures a CBS client + account pair exists for a demo identity.
     * Idempotent: skips if the CIN / account-number already exists in cbs_db.
     * Returns the minted RIB so callers can reference it without recomputing.
     */
    private String seedCbsClientAndAccount(String cin, String firstName, String lastName,
                                           String governorate, String bankNumericCode,
                                           long acctSeq, int accountAgeDays,
                                           BigDecimal balance) {
        String email = (firstName + "." + lastName)
                .toLowerCase().replaceAll("\\s+", "") + ".demo@payzo.tn";
        String phone = "+216" + cin;
        LocalDate dob = LocalDate.now().minusYears(28);
        LocalDate openedAt = LocalDate.now().minusDays(accountAgeDays);
        String rib = RibMinter.mint(bankNumericCode, BRANCH, acctSeq);

        CbsClient cbsClient = cbsClientRepository.findByCin(cin).orElseGet(() -> {
            CbsClient c = new CbsClient();
            c.setCin(cin);
            c.setFirstName(firstName);
            c.setLastName(lastName);
            c.setEmail(email);
            c.setPhone(phone);
            c.setDateOfBirth(dob);
            c.setAddress("Avenue Demo, " + governorate);
            c.setGovernorate(governorate);
            return cbsClientRepository.save(c);
        });
        if (!cbsAccountRepository.findByAccountNumber(rib).isPresent()) {
            CbsAccount account = new CbsAccount();
            account.setAccountNumber(rib);
            account.setClient(cbsClient);
            account.setBankCode(bankNumericCodeToBankCode(bankNumericCode));
            account.setType(AccountType.CHECKING);
            account.setBalance(balance);
            account.setOpenedAt(openedAt);
            cbsAccountRepository.save(account);
        }
        return rib;
    }

    private DemoUser createPayZoUser(String cin, String firstName, String lastName,
                                     String governorate, String bankNumericCode,
                                     long acctSeq, int accountAgeDays,
                                     BigDecimal balance, int trustScore) {
        String email = (firstName + "." + lastName)
                .toLowerCase().replaceAll("\\s+", "") + ".demo@payzo.tn";
        String phone = "+216" + cin;
        LocalDate dob = LocalDate.now().minusYears(28);
        LocalDate openedAt = LocalDate.now().minusDays(accountAgeDays);

        // ── CBS side ──────────────────────────────────────────────────────
        String rib = seedCbsClientAndAccount(cin, firstName, lastName, governorate,
                                             bankNumericCode, acctSeq, accountAgeDays, balance);

        // ── Keycloak side ─────────────────────────────────────────────────
        // Don't swallow — if Keycloak rejects, let the @Transactional roll
        // back ALL the DB inserts so we can't end up with orphaned PayZo
        // records that have no way to log in. The next seed run will retry
        // cleanly thanks to KeycloakAdminService's orphan-recovery.
        UUID keycloakId = keycloakAdminService.createClientUser(
                cin, email, firstName, lastName, DEMO_PASSWORD);

        // ── PayZo Client row ──────────────────────────────────────────────
        Client client = new Client();
        client.setKeycloakId(keycloakId);
        client.setCin(cin);
        client.setUsername(firstName.toLowerCase() + "." + lastName.toLowerCase().replaceAll("\\s+", ""));
        client.setFirstName(firstName);
        client.setLastName(lastName);
        client.setEmail(email);
        client.setPhone(phone);
        client.setRole(Role.CLIENT);
        client.setStatus(UserStatus.ACTIVE);
        client.setGovernorate(governorate);
        client.setDateOfBirth(dob);
        client.setAddress("Avenue Demo, " + governorate);
        client.setTrustScore(trustScore);
        client.setDefaultAccountId(rib);
        client.setFirstLoginCompleted(true);
        // Backdate createdAt so senderAccountAgeDays reads correctly at score time.
        client = clientRepository.save(client);
        clientRepository.flush();
        // The User.@PrePersist stamps createdAt = now(); align it with the CBS
        // openedAt so the ML feature `sender_account_age_days` matches the
        // visible CBS account age the demo presenter is showing.
        clientRepository.backdateCreatedAt(
                client.getId(),
                openedAt.atStartOfDay().atOffset(ZoneOffset.UTC));

        log.info("DemoSeedService: seeded {} {} (cin={}, rib={})",
                firstName, lastName, cin, rib);
        return new DemoUser(client, cin, firstName, lastName, rib, balance);
    }

    /** Mule = CBS-only recipient. Returns the minted RIB so the runbook can
     *  print it. The demo presenter copy-pastes this to trigger fraud. */
    private String createMule() {
        String rib = RibMinter.mint(BANK_AMEN, BRANCH, 99_999L);
        CbsClient mule = cbsClientRepository.findByCin(MULE_CIN).orElseGet(() -> {
            CbsClient c = new CbsClient();
            c.setCin(MULE_CIN);
            c.setFirstName("Inconnu");
            c.setLastName("Receveur");
            c.setEmail("inconnu.demo@example.com");
            c.setPhone("+21629000099");
            c.setDateOfBirth(LocalDate.of(1985, 1, 1));
            c.setAddress("Address Unknown");
            c.setGovernorate("Médenine");   // far from the demo senders' governorates
            return cbsClientRepository.save(c);
        });
        if (!cbsAccountRepository.findByAccountNumber(rib).isPresent()) {
            CbsAccount account = new CbsAccount();
            account.setAccountNumber(rib);
            account.setClient(mule);
            account.setBankCode("AMEN");
            account.setType(AccountType.CHECKING);
            account.setBalance(new BigDecimal("100.00"));
            account.setOpenedAt(LocalDate.now().minusDays(8));   // freshly opened ⇒ isDestNewAccount = 1
            cbsAccountRepository.save(account);
        }
        return rib;
    }

    private void createBeneficiary(Client sender, String destRib,
                                   String destFirstName, String destLastName,
                                   String nickname,
                                   int transferCount, OffsetDateTime lastUsedAt) {
        Beneficiary b = new Beneficiary();
        b.setClient(sender);
        b.setAccountNumber(destRib);
        b.setCachedFirstName(destFirstName);
        b.setCachedLastName(destLastName);
        b.setNickname(nickname);
        b.setBankCode(extractBankAlpha(destRib));
        b.setFavorite(transferCount >= 10);
        b.setConfirmedAt(lastUsedAt.minusDays(transferCount * 2L));
        b.setFirstUsedAt(lastUsedAt.minusDays(transferCount * 2L));
        b.setLastUsedAt(lastUsedAt);
        b.setTransferCount(transferCount);
        beneficiaryRepository.save(b);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Transaction history seeding
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Insert {@code count} APPROVED transactions for {@code sender}, spread
     * evenly across the last 30 days. Amounts drawn from
     * {@code exp(N(mu, sigma))}. Hours sampled from the supplied 24-bin
     * weight table. {@code savedDestRib} appears in ~30% of rows (matching
     * the saved-beneficiary frequency that the live model expects);
     * remaining rows rotate over {@code altDestCount} synthetic destination
     * RIBs.
     */
    private void seedHistory(Random rng, DemoUser sender, int count,
                             double mu, double sigma,
                             double[] hourWeights,
                             String savedDestRib, int altDestCount) {
        // Build the rotating destination pool.
        List<String> destPool = new ArrayList<>(altDestCount + 1);
        destPool.add(savedDestRib);
        long baseSeq = 90_000_000L + (rng.nextInt(900_000) * 100L);
        for (int i = 0; i < altDestCount; i++) {
            destPool.add(RibMinter.mint(BANK_BIAT, BRANCH, baseSeq + i));
        }

        OffsetDateTime now = OffsetDateTime.now();
        long spanSeconds = 30L * 24 * 3600;

        List<Map.Entry<UUID, OffsetDateTime>> historicalStamps = new ArrayList<>(count);

        for (int i = 0; i < count; i++) {
            double amount = Math.max(5.0, Math.exp(mu + sigma * rng.nextGaussian()));
            int hour = sampleIndex(rng, hourWeights);
            // Spread evenly with mild jitter so timestamps aren't perfectly
            // periodic — the per-user features tolerate either, but realistic
            // is realistic.
            double t = (i + rng.nextDouble()) / count;
            OffsetDateTime ts = now
                    .minusSeconds((long) ((1.0 - t) * spanSeconds))
                    .withHour(hour)
                    .withMinute(rng.nextInt(60))
                    .withSecond(rng.nextInt(60));

            // ~30% saved-beneficiary frequency to set transfers_to_dest_lifetime
            // realistically without inflating the demo-recipient beneficiary
            // beyond its declared transferCount.
            String dest = rng.nextDouble() < 0.30
                    ? savedDestRib
                    : destPool.get(1 + rng.nextInt(destPool.size() - 1));

            Transaction tx = new Transaction();
            tx.setReference(referenceGenerator.generate());
            tx.setClient(sender.client);
            tx.setSourceAccountNumber(sender.rib);
            tx.setDestinationAccountNumber(dest);
            tx.setSourceBankCode(extractBankAlpha(sender.rib));
            tx.setDestBankCode(extractBankAlpha(dest));
            tx.setAmount(BigDecimal.valueOf(amount).setScale(2, java.math.RoundingMode.HALF_UP));
            tx.setStatus(TransactionStatus.APPROVED);
            tx.setSourceBalanceBefore(sender.openingBalance);
            tx.setDestBalanceBefore(new BigDecimal("500.00"));
            tx.setMotif(HISTORY_MOTIFS[rng.nextInt(HISTORY_MOTIFS.length)]);

            tx = transactionRepository.save(tx);
            historicalStamps.add(Map.entry(tx.getId(), ts));
        }

        // Backdate all timestamps (the @PrePersist hook stamped them to now()).
        for (Map.Entry<UUID, OffsetDateTime> e : historicalStamps) {
            transactionRepository.setHistoricalTimestamps(e.getKey(), e.getValue());
        }
        log.info("DemoSeedService: seeded {} historical transactions for cin={}",
                count, sender.cin);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Small helpers
    // ─────────────────────────────────────────────────────────────────────

    /** Map "08" → "BIAT", "10" → "STB", etc., by reading the locally-cached
     *  CBS bank table indirectly via numeric → name lookup. Falls back to a
     *  small hardcoded map if the CBS bank rows aren't reachable. */
    private static String bankNumericCodeToBankCode(String numericCode) {
        return switch (numericCode) {
            case "04" -> "ATB";
            case "07" -> "AMEN";
            case "08" -> "BIAT";
            case "10" -> "STB";
            case "11" -> "BTE";
            case "12" -> "UIB";
            case "25" -> "ZTB";
            default -> "UNK";
        };
    }

    private static String extractBankAlpha(String rib) {
        return bankNumericCodeToBankCode(rib.substring(0, 2));
    }

    /** Returns a copy of {@code weights} normalized to sum to 1. */
    private static double[] normalize(double[] weights) {
        double total = 0;
        for (double w : weights) total += w;
        double[] out = new double[weights.length];
        for (int i = 0; i < weights.length; i++) out[i] = weights[i] / total;
        return out;
    }

    /** Sample an index from a discrete probability distribution. */
    private static int sampleIndex(Random rng, double[] weights) {
        double r = rng.nextDouble();
        double cum = 0;
        for (int i = 0; i < weights.length; i++) {
            cum += weights[i];
            if (r < cum) return i;
        }
        return weights.length - 1;
    }

    /** Internal carry-around bundle for a seeded sender. */
    private record DemoUser(Client client, String cin, String firstName,
                            String lastName, String rib, BigDecimal openingBalance) {}
}
