package com.payzo.backend.repository;

import com.payzo.backend.domain.entity.User;
import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.domain.enums.UserStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID>, JpaSpecificationExecutor<User> {

    Optional<User> findByEmail(String email);

    Optional<User> findByKeycloakId(UUID keycloakId);

    Optional<User> findByUsername(String username);

    Optional<User> findByCin(String cin);

    /**
     * Single-field login resolution: accepts either a CIN or a username (D23).
     * Returns at most one user since both columns are unique.
     */
    @Query("SELECT u FROM User u WHERE u.cin = :identifier OR u.username = :identifier")
    Optional<User> findByCinOrUsername(@Param("identifier") String identifier);

    List<User> findByStatus(UserStatus status);

    List<User> findByRole(Role role);

    boolean existsByEmail(String email);

    boolean existsByUsername(String username);

    /**
     * Case-insensitive existence check used by the editable-username flow
     * ({@link com.payzo.backend.service.client.ClientService#updateUsername}).
     * Storage is already lowercase per {@link com.payzo.backend.util.UsernameValidator},
     * but the {@code IgnoreCase} suffix is defensive against any legacy /
     * pre-validator row that may have slipped in with mixed case.
     */
    boolean existsByUsernameIgnoreCase(String username);

    long countByStatus(UserStatus status);

    long countByRole(Role role);
}
