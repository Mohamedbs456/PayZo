package com.payzo.backend.cbs.repository;

import com.payzo.backend.cbs.entity.CbsAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface CbsAccountRepository extends JpaRepository<CbsAccount, String> {

    Optional<CbsAccount> findByAccountNumber(String accountNumber);

    /** Batch variant used by BeneficiaryService.list() to enrich a page of beneficiaries in one query. */
    List<CbsAccount> findByAccountNumberIn(Collection<String> accountNumbers);

    List<CbsAccount> findByClientCin(String cin);

    /** Used by the Accounts-page bank filter to find every account in one bank. */
    List<CbsAccount> findByBankCode(String bankCode);

    /** Used by the Accounts-page search box to resolve "account starts/contains digits"
     *  queries to the CINs of the owning clients. Case-insensitive even though
     *  account numbers are pure digits — costs nothing and tolerates future format
     *  changes. */
    List<CbsAccount> findByAccountNumberContainingIgnoreCase(String pattern);
}
