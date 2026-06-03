package com.payzo.cbs.init;

import com.payzo.cbs.model.AccountType;
import com.payzo.cbs.model.CbsAccount;
import com.payzo.cbs.model.CbsBank;
import com.payzo.cbs.model.CbsClient;
import com.payzo.cbs.model.CbsTransaction;
import com.payzo.cbs.model.TransactionType;
import com.payzo.cbs.repository.CbsAccountRepository;
import com.payzo.cbs.repository.CbsBankRepository;
import com.payzo.cbs.repository.CbsClientRepository;
import com.payzo.cbs.repository.CbsTransactionRepository;
import com.payzo.cbs.util.RibGenerator;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.UUID;

/**
 * Seeds the CBS ledger on startup so the platform demo runs against a realistic
 * dataset. Seeds 7 Tunisian banks (with proper 2-digit numeric codes), 50
 * clients, ~110 accounts spread across the banks, and ~1600 pre-existing
 * transactions with balances kept positive. Account numbers are real
 * 20-digit Tunisian RIBs (mod-97 check digit). Idempotent: bank seeding
 * guards on bankRepository.count(), client/account/tx seeding guards on
 * clientRepository.count().
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DataInitializer {

    private final CbsBankRepository bankRepository;
    private final CbsClientRepository clientRepository;
    private final CbsAccountRepository accountRepository;
    private final CbsTransactionRepository transactionRepository;

    private static final String[] FIRST_NAMES = {
            "Mohamed", "Ahmed", "Ali", "Youssef", "Khalil",
            "Omar", "Amine", "Hamza", "Sami", "Rami",
            "Nabil", "Fares", "Bilel", "Mehdi", "Karim",
            "Hichem", "Sofiane", "Walid", "Slim", "Zied",
            "Fatma", "Amira", "Ines", "Mariem", "Sarra",
            "Hana", "Nour", "Yasmine", "Rim", "Salma",
            "Amel", "Rania", "Dorra", "Leila", "Olfa",
            "Sirine", "Chaima", "Asma", "Ghada", "Manel",
            "Anas", "Skander", "Fathi", "Mondher", "Taoufik",
            "Ridha", "Habib", "Lotfi", "Moez", "Tarek"
    };

    private static final String[] LAST_NAMES = {
            "Ben Salem", "Trabelsi", "Bouazizi", "Gharbi", "Ayari",
            "Jebali", "Haddad", "Maalej", "Sfaxi", "Khelifi",
            "Ferchichi", "Dridi", "Zouari", "Chebbi", "Mejri",
            "Bouzid", "Hammami", "Riahi", "Chaabane", "Ghannouchi",
            "Jaziri", "Mbarki", "Sassi", "Slimane", "Tlili",
            "Abidi", "Brahem", "Chouchane", "Dhouib", "Fakhfakh",
            "Guesmi", "Haj Ali", "Kaabi", "Lahmar", "Mansouri",
            "Nasri", "Oueslati", "Rezgui", "Souissi", "Touati",
            "Ben Ammar", "Ben Fredj", "Ben Haj", "Ben Youssef", "Chaker",
            "Daoud", "Ettounsi", "Fellah", "Guedri", "Helali"
    };

    /**
     * Seven Tunisian banks with their official 2-digit numeric codes. The
     * numeric code is the prefix used in real RIBs and is what
     * {@link RibGenerator} stitches into the first two digits of each
     * account number.
     */
    private static final String[][] BANK_SEED = {
            {"STB",  "10", "Société Tunisienne de Banque"},
            {"ATB",  "04", "Arab Tunisian Bank"},
            {"BIAT", "08", "Banque Internationale Arabe de Tunisie"},
            {"ZTB",  "25", "Zitouna Bank"},
            {"AMEN", "07", "Amen Bank"},
            {"BTE",  "11", "Banque de Tunisie et des Émirats"},
            {"UIB",  "12", "Union Internationale de Banques"}
    };

    private static final String DEFAULT_BRANCH = "001";

    private static final String[] GOVERNORATES = {
            "Tunis", "Ariana", "Ben Arous", "Manouba", "Nabeul",
            "Zaghouan", "Bizerte", "Beja", "Jendouba", "Le Kef",
            "Siliana", "Sousse", "Monastir", "Mahdia", "Sfax",
            "Kairouan", "Kasserine", "Sidi Bouzid", "Gabes",
            "Medenine", "Tataouine", "Gafsa", "Tozeur", "Kebili"
    };

    private static final String[] STREETS = {
            "Avenue Habib Bourguiba", "Rue de la Liberté", "Avenue de la République",
            "Rue Ibn Khaldoun", "Avenue Mohamed V", "Rue de Carthage",
            "Avenue Farhat Hached", "Rue du 1er Juin", "Avenue de Paris",
            "Rue Tahar Sfar", "Avenue de l'Environnement", "Rue Ali Belhouane"
    };

    private static final String[] TX_DESCRIPTIONS_DEBIT = {
            "Grocery shopping", "Utility bill payment", "Restaurant payment",
            "Fuel station", "Online purchase", "Rent payment",
            "Phone bill", "Insurance premium", "Medical expenses",
            "Transport ticket", "Subscription payment", "School fees"
    };

    private static final String[] TX_DESCRIPTIONS_CREDIT = {
            "Salary deposit", "Freelance payment", "Refund",
            "Transfer received", "Cash deposit", "Interest credit",
            "Bonus payment", "Commission income", "Rental income",
            "Government aid", "Scholarship deposit", "Investment return"
    };

    @PostConstruct
    public void init() {
        List<CbsBank> banks = seedBanksIfEmpty();
        seedClientsAndAccountsIfEmpty(banks);
    }

    private List<CbsBank> seedBanksIfEmpty() {
        if (bankRepository.count() > 0) {
            log.info("CBS banks already seeded — skipping");
            return bankRepository.findAll();
        }
        log.info("Seeding CBS banks ({} entries)...", BANK_SEED.length);
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        List<CbsBank> banks = new ArrayList<>();
        for (String[] row : BANK_SEED) {
            banks.add(CbsBank.builder()
                    .code(row[0])
                    .numericCode(row[1])
                    .name(row[2])
                    .createdAt(now)
                    .build());
        }
        return bankRepository.saveAll(banks);
    }

    private void seedClientsAndAccountsIfEmpty(List<CbsBank> banks) {
        if (clientRepository.count() > 0) {
            log.info("CBS client data already seeded — skipping");
            return;
        }

        log.info("Seeding CBS simulator with 50 Tunisian clients...");
        Random rng = new Random(42);

        List<CbsClient> clients = new ArrayList<>();
        List<CbsAccount> allAccounts = new ArrayList<>();
        List<CbsTransaction> allTransactions = new ArrayList<>();

        long accountSeq = 1L;

        for (int i = 0; i < 50; i++) {
            String cin = String.format("%08d", 10000000 + rng.nextInt(89999999));
            String firstName = FIRST_NAMES[i];
            String lastName = LAST_NAMES[i];
            String emailBase = (firstName + "." + lastName.replace(" ", "")).toLowerCase();

            CbsClient client = CbsClient.builder()
                    .cin(cin)
                    .firstName(firstName)
                    .lastName(lastName)
                    .email(emailBase + "@gmail.com")
                    .phone("+216" + (20 + rng.nextInt(79)) + String.format("%06d", rng.nextInt(999999)))
                    .dateOfBirth(LocalDate.of(1970 + rng.nextInt(35), 1 + rng.nextInt(12), 1 + rng.nextInt(28)))
                    .address(rng.nextInt(200) + " " + STREETS[rng.nextInt(STREETS.length)] + ", " + GOVERNORATES[rng.nextInt(GOVERNORATES.length)])
                    .governorate(GOVERNORATES[rng.nextInt(GOVERNORATES.length)])
                    .build();

            clients.add(client);

            CbsBank bank = banks.get(i % banks.size());
            int numAccounts = 1 + rng.nextInt(3);

            for (int a = 0; a < numAccounts; a++) {
                String accountNumber = RibGenerator.generate(bank.getNumericCode(), DEFAULT_BRANCH, accountSeq++);
                AccountType type = (a == 0) ? AccountType.CHECKING : AccountType.SAVINGS;
                BigDecimal initialBalance = BigDecimal.valueOf(500 + rng.nextInt(49500)).setScale(2, RoundingMode.HALF_UP);
                LocalDate openedAt = LocalDate.of(2020 + rng.nextInt(4), 1 + rng.nextInt(12), 1 + rng.nextInt(28));

                CbsAccount account = CbsAccount.builder()
                        .accountNumber(accountNumber)
                        .client(client)
                        .bankCode(bank.getCode())
                        .type(type)
                        .balance(initialBalance)
                        .openedAt(openedAt)
                        .build();

                allAccounts.add(account);

                int numTx = 10 + rng.nextInt(11);
                BigDecimal runningBalance = initialBalance;
                for (int t = 0; t < numTx; t++) {
                    boolean isDebit = rng.nextBoolean();
                    BigDecimal txAmount = BigDecimal.valueOf(50 + rng.nextInt(4950)).setScale(2, RoundingMode.HALF_UP);

                    if (isDebit && runningBalance.compareTo(txAmount) < 0) {
                        isDebit = false;
                    }

                    if (isDebit) {
                        runningBalance = runningBalance.subtract(txAmount);
                    } else {
                        runningBalance = runningBalance.add(txAmount);
                    }

                    OffsetDateTime txTime = OffsetDateTime.of(
                            openedAt.plusDays(rng.nextInt(365)),
                            java.time.LocalTime.of(rng.nextInt(24), rng.nextInt(60), rng.nextInt(60)),
                            ZoneOffset.ofHours(1)
                    );

                    String[] descArray = isDebit ? TX_DESCRIPTIONS_DEBIT : TX_DESCRIPTIONS_CREDIT;
                    CbsBank counterpartBank = banks.get(rng.nextInt(banks.size()));
                    long counterpartSeq = 100_000_000L + rng.nextInt(900_000_000);
                    String counterpart = RibGenerator.generate(counterpartBank.getNumericCode(), DEFAULT_BRANCH, counterpartSeq);

                    allTransactions.add(CbsTransaction.builder()
                            .id(UUID.randomUUID())
                            .account(account)
                            .clientCin(client.getCin())
                            .type(isDebit ? TransactionType.DEBIT : TransactionType.CREDIT)
                            .amount(txAmount)
                            .counterpartAccount(counterpart)
                            .description(descArray[rng.nextInt(descArray.length)])
                            .timestamp(txTime)
                            .build());
                }

                account.setBalance(runningBalance.max(BigDecimal.valueOf(500)));
            }
        }

        clientRepository.saveAll(clients);
        accountRepository.saveAll(allAccounts);
        transactionRepository.saveAll(allTransactions);

        log.info("CBS seeding complete: {} clients, {} accounts, {} transactions",
                clients.size(), allAccounts.size(), allTransactions.size());

        StringBuilder sample = new StringBuilder("CBS sample CINs (first 5):");
        for (int i = 0; i < Math.min(5, clients.size()); i++) {
            CbsClient c = clients.get(i);
            sample.append(' ').append(c.getCin())
                  .append(" (").append(c.getFirstName()).append(' ').append(c.getLastName()).append(')');
            if (i < 4) sample.append(',');
        }
        log.info(sample.toString());
    }
}
