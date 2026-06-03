package com.payzo.backend.repository;

import com.payzo.backend.domain.entity.MlThresholdReport;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface MlThresholdReportRepository extends JpaRepository<MlThresholdReport, UUID> {

    Page<MlThresholdReport> findAllByOrderBySubmittedAtDesc(Pageable pageable);
}
