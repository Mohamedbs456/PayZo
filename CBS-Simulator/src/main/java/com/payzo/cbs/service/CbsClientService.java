package com.payzo.cbs.service;

import com.payzo.cbs.exception.AccountNotFoundException;
import com.payzo.cbs.exception.CbsClientNotFoundException;
import com.payzo.cbs.model.CbsAccount;
import com.payzo.cbs.model.CbsClient;
import com.payzo.cbs.model.CbsTransaction;
import com.payzo.cbs.repository.CbsAccountRepository;
import com.payzo.cbs.repository.CbsClientRepository;
import com.payzo.cbs.repository.CbsTransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** Read-only lookups for client, account, and transaction history, throwing the dedicated *NotFound exceptions for 404 mapping. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CbsClientService {

    private final CbsClientRepository clientRepository;
    private final CbsAccountRepository accountRepository;
    private final CbsTransactionRepository transactionRepository;

    public CbsClient findByCin(String cin) {
        return clientRepository.findById(cin)
                .orElseThrow(() -> new CbsClientNotFoundException(cin));
    }

    public List<CbsAccount> getAccountsByClientCin(String cin) {
        if (!clientRepository.existsById(cin)) {
            throw new CbsClientNotFoundException(cin);
        }
        return accountRepository.findByClientCin(cin);
    }

    public CbsAccount getAccountByNumber(String accountNumber) {
        return accountRepository.findById(accountNumber)
                .orElseThrow(() -> new AccountNotFoundException(accountNumber));
    }

    public Page<CbsTransaction> getTransactionsByAccountNumber(String accountNumber, Pageable pageable) {
        return transactionRepository.findByAccountAccountNumberOrderByTimestampDesc(accountNumber, pageable);
    }
}
