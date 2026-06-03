package com.payzo.backend.repository;

import com.payzo.backend.domain.entity.OtpToken;
import com.payzo.backend.domain.enums.OtpPurpose;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface OtpTokenRepository extends JpaRepository<OtpToken, UUID> {

    /**
     * Fast OTP lookup — hits the idx_otp_identifier_purpose_unused composite index.
     * Returns the most recently created valid (unused, unexpired) token for the given key.
     */
    Optional<OtpToken> findTopByIdentifierAndPurposeAndUsedFalseAndExpiresAtAfterOrderByCreatedAtDesc(
            String identifier, OtpPurpose purpose, OffsetDateTime now);

    /** Used by OtpService to bulk-mark previous codes as used before issuing a new one */
    List<OtpToken> findByIdentifierAndPurposeAndUsedFalse(String identifier, OtpPurpose purpose);

    /**
     * Client deletion cascade. The OTP table doesn't FK-reference users (its
     * `identifier` column is a free string holding either CIN or user-UUID), so
     * we delete by every identifier the deleted user can match against.
     */
    void deleteByIdentifierIn(List<String> identifiers);
}
