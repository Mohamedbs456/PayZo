package com.payzo.backend.repository;

import com.payzo.backend.domain.entity.MlModelConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface MlModelConfigRepository extends JpaRepository<MlModelConfig, UUID> {

    /**
     * Singleton row accessor.
     * Usage: findFirstBy().orElseThrow(() -> new IllegalStateException("ML config not seeded"))
     */
    Optional<MlModelConfig> findFirstBy();
}
