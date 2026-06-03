package com.payzo.backend.service.integration;

import com.payzo.backend.cbs.entity.CbsAccount;
import com.payzo.backend.cbs.entity.CbsBank;
import com.payzo.backend.cbs.entity.CbsClient;
import com.payzo.backend.cbs.entity.CbsTransaction;
import com.payzo.backend.cbs.entity.TransactionType;
import com.payzo.backend.cbs.repository.CbsAccountRepository;
import com.payzo.backend.cbs.repository.CbsBankRepository;
import com.payzo.backend.cbs.repository.CbsClientRepository;
import com.payzo.backend.cbs.repository.CbsTransactionRepository;
import com.payzo.backend.exception.CbsClientNotFoundException;
import com.payzo.backend.exception.ConflictException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Direct JPA access to cbs_db (D2). Same public API the rest of the backend already
 * depends on — only the internals changed (no more REST hop).
 *
 * <p>Writes (executeTransfer) run inside a CBS-scoped transaction. Reads use the
 * same datasource; the @Transactional(readOnly=true) at class level makes the
 * lookups participate in a CBS transaction when they're called outside of one.
 */
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(transactionManager = "cbsTransactionManager", readOnly = true)
public class CbsIntegrationService {

    private final CbsClientRepository clientRepository;
    private final CbsAccountRepository accountRepository;
    private final CbsTransactionRepository transactionRepository;
    private final CbsBankRepository bankRepository;

    public List<CbsBankData> listBanks() {
        return bankRepository.findAll().stream()
                .map(b -> new CbsBankData(b.getCode(), b.getNumericCode(), b.getName()))
                .toList();
    }

    public java.util.Optional<CbsBankData> findBankByNumericCode(String numericCode) {
        return bankRepository.findByNumericCode(numericCode)
                .map(b -> new CbsBankData(b.getCode(), b.getNumericCode(), b.getName()));
    }

    public CbsClientData getClientByCin(String cin) {
        CbsClient c = clientRepository.findByCin(cin)
                .orElseThrow(() -> new CbsClientNotFoundException("CIN not found in CBS: " + cin));
        return new CbsClientData(
                c.getFirstName(), c.getLastName(), c.getEmail(), c.getPhone(),
                c.getGovernorate(), c.getAddress(), c.getDateOfBirth());
    }

    /**
     * Optional sibling of {@link #getClientByCin} for enrichment lookups where a
     * missing CBS client should fall through silently rather than throw. Used by
     * transaction-list mapping to resolve a recipient's name when they aren't on
     * PayZo but still exist in CBS.
     */
    public java.util.Optional<CbsClientData> findClientByCin(String cin) {
        return clientRepository.findByCin(cin).map(c -> new CbsClientData(
                c.getFirstName(), c.getLastName(), c.getEmail(), c.getPhone(),
                c.getGovernorate(), c.getAddress(), c.getDateOfBirth()));
    }

    public List<CbsAccountData> getAccountsByClientCin(String cin) {
        return accountRepository.findByClientCin(cin).stream()
                .map(this::toAccountData)
                .toList();
    }

    /**
     * Returns the set of CINs (CBS-side) that hold at least one account in the
     * given bank. Used by the Accounts page bank filter — the backoffice list
     * cross-references this set against payzo_db's clients table.
     */
    public java.util.Set<String> findClientCinsByBankCode(String bankCode) {
        return accountRepository.findByBankCode(bankCode).stream()
                .map(a -> a.getClient().getCin())
                .collect(java.util.stream.Collectors.toSet());
    }

    /**
     * Returns the set of CINs whose CBS accounts match the given account-number
     * substring. Used by the BO Accounts/Clients search box so admins can type
     * (a fragment of) an account number and find the holder.
     */
    public java.util.Set<String> findClientCinsByAccountNumber(String accountNumberPattern) {
        return accountRepository.findByAccountNumberContainingIgnoreCase(accountNumberPattern).stream()
                .map(a -> a.getClient().getCin())
                .collect(java.util.stream.Collectors.toSet());
    }

    /**
     * Returns a {@code bankCode → distinct CINs} map across the entire CBS
     * footprint. Drives the SA/Admin dashboard "clients per bank" pie: each
     * client is counted in every bank they hold an account at, so a multi-bank
     * client contributes +1 to each slice (totals across slices may exceed
     * total clients — expected behaviour).
     */
    public java.util.Map<String, java.util.Set<String>> findCinsByBank() {
        return accountRepository.findAll().stream()
                .collect(java.util.stream.Collectors.groupingBy(
                        CbsAccount::getBankCode,
                        java.util.stream.Collectors.mapping(
                                a -> a.getClient().getCin(),
                                java.util.stream.Collectors.toSet())));
    }

    public CbsAccountData getAccountByNumber(String accountNum) {
        CbsAccount a = accountRepository.findByAccountNumber(accountNum)
                .orElseThrow(() -> new CbsClientNotFoundException("Account not found in CBS: " + accountNum));
        return toAccountData(a);
    }

    /**
     * Batch resolves a set of RIBs to their CBS account data. Missing RIBs are simply absent
     * from the returned map (no exception). Used by BeneficiaryService.list() to enrich a page
     * of beneficiaries in a single CBS query, avoiding the N+1 of per-row lookups.
     */
    public Map<String, CbsAccountData> getAccountsByNumbers(Collection<String> accountNumbers) {
        if (accountNumbers == null || accountNumbers.isEmpty()) return Map.of();
        return accountRepository.findByAccountNumberIn(accountNumbers).stream()
                .collect(Collectors.toMap(CbsAccount::getAccountNumber, this::toAccountData));
    }

    @Transactional(transactionManager = "cbsTransactionManager")
    public CbsTransferResult executeTransfer(String sourceAccount, String destAccount,
                                             BigDecimal amount, String reference) {
        CbsAccount source = accountRepository.findByAccountNumber(sourceAccount)
                .orElseThrow(() -> new CbsClientNotFoundException("Source account not found: " + sourceAccount));
        CbsAccount dest = accountRepository.findByAccountNumber(destAccount)
                .orElseThrow(() -> new CbsClientNotFoundException("Dest account not found: " + destAccount));

        if (source.getBalance().compareTo(amount) < 0) {
            throw new ConflictException("Insufficient balance", "INSUFFICIENT_BALANCE");
        }

        BigDecimal newSourceBalance = source.getBalance().subtract(amount);
        BigDecimal newDestBalance = dest.getBalance().add(amount);
        source.setBalance(newSourceBalance);
        dest.setBalance(newDestBalance);
        accountRepository.save(source);
        accountRepository.save(dest);

        OffsetDateTime now = OffsetDateTime.now();

        transactionRepository.save(CbsTransaction.builder()
                .id(UUID.randomUUID())
                .account(source)
                .clientCin(source.getClient().getCin())
                .referenceByPayZo(reference)
                .type(TransactionType.DEBIT)
                .amount(amount)
                .counterpartAccount(destAccount)
                .description("Transfer to " + destAccount)
                .timestamp(now)
                .build());

        transactionRepository.save(CbsTransaction.builder()
                .id(UUID.randomUUID())
                .account(dest)
                .clientCin(dest.getClient().getCin())
                .referenceByPayZo(reference)
                .type(TransactionType.CREDIT)
                .amount(amount)
                .counterpartAccount(sourceAccount)
                .description("Transfer from " + sourceAccount)
                .timestamp(now)
                .build());

        log.info("CBS transfer executed: ref={} src={} dst={} amount={}",
                reference, sourceAccount, destAccount, amount);

        return new CbsTransferResult(true, newSourceBalance, newDestBalance);
    }

    private CbsAccountData toAccountData(CbsAccount a) {
        return new CbsAccountData(
                a.getAccountNumber(),
                a.getBankCode(),
                null,
                a.getType().name(),
                a.getBalance(),
                a.getClient().getCin(),
                a.getOpenedAt());
    }

    public record CbsBankData(String code, String numericCode, String name) {}

    public record CbsClientData(String firstName, String lastName, String email, String phone,
                                 String governorate, String address, LocalDate dateOfBirth) {}

    public record CbsAccountData(String accountNumber, String bankCode, String bankName,
                                 String type, BigDecimal balance,
                                 String clientCin, LocalDate openedAt) {}

    public record CbsTransferResult(boolean success, BigDecimal newSourceBalance,
                                    BigDecimal newDestBalance) {}
}
