package com.payzo.cbs.service;

import com.payzo.cbs.exception.AccountNotFoundException;
import com.payzo.cbs.exception.InsufficientFundsException;
import com.payzo.cbs.model.CbsAccount;
import com.payzo.cbs.model.CbsTransaction;
import com.payzo.cbs.model.TransactionType;
import com.payzo.cbs.repository.CbsAccountRepository;
import com.payzo.cbs.repository.CbsTransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Atomic debit + credit pair under @Transactional. Validates both accounts
 * exist, throws InsufficientFundsException (400) if source balance is below
 * amount, then writes two CbsTransaction rows (DEBIT on source, CREDIT on
 * dest) sharing the same timestamp so the ledger lines up.
 */
@Service
@RequiredArgsConstructor
public class CbsTransferService {

    private final CbsAccountRepository accountRepository;
    private final CbsTransactionRepository transactionRepository;

    @Transactional
    public void executeTransfer(String sourceAccountNumber, String destAccountNumber, BigDecimal amount) {
        CbsAccount source = accountRepository.findById(sourceAccountNumber)
                .orElseThrow(() -> new AccountNotFoundException(sourceAccountNumber));
        CbsAccount dest = accountRepository.findById(destAccountNumber)
                .orElseThrow(() -> new AccountNotFoundException(destAccountNumber));

        if (source.getBalance().compareTo(amount) < 0) {
            throw new InsufficientFundsException(sourceAccountNumber);
        }

        source.setBalance(source.getBalance().subtract(amount));
        dest.setBalance(dest.getBalance().add(amount));

        accountRepository.save(source);
        accountRepository.save(dest);

        OffsetDateTime now = OffsetDateTime.now();

        transactionRepository.save(CbsTransaction.builder()
                .id(UUID.randomUUID())
                .account(source)
                .clientCin(source.getClient().getCin())
                .type(TransactionType.DEBIT)
                .amount(amount)
                .counterpartAccount(destAccountNumber)
                .description("Transfer to " + destAccountNumber)
                .timestamp(now)
                .build());

        transactionRepository.save(CbsTransaction.builder()
                .id(UUID.randomUUID())
                .account(dest)
                .clientCin(dest.getClient().getCin())
                .type(TransactionType.CREDIT)
                .amount(amount)
                .counterpartAccount(sourceAccountNumber)
                .description("Transfer from " + sourceAccountNumber)
                .timestamp(now)
                .build());
    }
}
