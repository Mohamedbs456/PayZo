package com.payzo.backend.repository;

import com.payzo.backend.domain.entity.Bank;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface BankRepository extends JpaRepository<Bank, UUID>, JpaSpecificationExecutor<Bank> {

    Optional<Bank> findByCode(String code);

    /**
     * Property name is {@code active} (entity field), not {@code isActive}.
     * Lombok generates {@code isActive()} on {@code boolean active}, so
     * Spring Data correctly resolves {@code findAllByActiveTrue()}.
     */
    List<Bank> findAllByActiveTrue();

    boolean existsByCode(String code);
}
