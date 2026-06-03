package com.payzo.cbs.repository;

import com.payzo.cbs.model.CbsTransaction;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface CbsTransactionRepository extends JpaRepository<CbsTransaction, UUID> {

    Page<CbsTransaction> findByAccountAccountNumberOrderByTimestampDesc(String accountNumber, Pageable pageable);
}
