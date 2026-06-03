package com.payzo.cbs.repository;

import com.payzo.cbs.model.CbsClient;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CbsClientRepository extends JpaRepository<CbsClient, String> {
}
