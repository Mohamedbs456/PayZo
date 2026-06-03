package com.payzo.backend.cbs.repository;

import com.payzo.backend.cbs.entity.CbsTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface CbsTransactionRepository
        extends JpaRepository<CbsTransaction, UUID>, JpaSpecificationExecutor<CbsTransaction> {

    List<CbsTransaction> findByClientCinAndTimestampAfter(String clientCin, OffsetDateTime threshold);
}
