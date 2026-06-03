package com.payzo.backend.cbs.repository;

import com.payzo.backend.cbs.entity.CbsBank;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CbsBankRepository extends JpaRepository<CbsBank, String> {
    Optional<CbsBank> findByNumericCode(String numericCode);
}
