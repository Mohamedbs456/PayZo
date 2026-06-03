package com.payzo.backend.cbs.repository;

import com.payzo.backend.cbs.entity.CbsClient;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CbsClientRepository extends JpaRepository<CbsClient, String> {

    Optional<CbsClient> findByCin(String cin);
}
