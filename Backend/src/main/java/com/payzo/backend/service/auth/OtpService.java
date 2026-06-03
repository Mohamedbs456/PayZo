package com.payzo.backend.service.auth;

import com.payzo.backend.domain.entity.OtpToken;
import com.payzo.backend.domain.enums.OtpPurpose;
import com.payzo.backend.exception.InvalidOtpException;
import com.payzo.backend.exception.OtpExpiredException;
import com.payzo.backend.exception.OtpMaxAttemptsException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.OtpTokenRepository;
import com.payzo.backend.service.notification.NotificationService;
import com.payzo.backend.util.OtpGenerator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 6-digit OTPs via SecureRandom, 5-minute TTL, max 3 attempts before the token
 * is invalidated. 4 purposes: REGISTRATION, LOGIN, TRANSFER_CONFIRMATION,
 * PASSWORD_CHANGE. Resend is rate-limited to one per minute per identifier via
 * an in-memory map (single-instance backend; would need Redis at scale). Dev
 * mode logs OTPs to console and never dispatches.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class OtpService {

    private final OtpTokenRepository otpTokenRepository;
    private final OtpGenerator otpGenerator;
    private final NotificationService notificationService;

    @Value("${otp.delivery.enabled}")
    private boolean otpDeliveryEnabled;

    private final ConcurrentHashMap<String, Instant> resendRateLimitMap = new ConcurrentHashMap<>();

    private static final int OTP_TTL_MINUTES = 5;
    private static final int MAX_ATTEMPTS = 3;
    private static final long RESEND_COOLDOWN_SECONDS = 60;

    @Transactional
    public void generate(String identifier, OtpPurpose purpose,
                         String recipientEmail, String recipientPhone) {

        List<OtpToken> existing = otpTokenRepository
                .findByIdentifierAndPurposeAndUsedFalse(identifier, purpose);
        existing.forEach(t -> t.setUsed(true));
        otpTokenRepository.saveAll(existing);

        String code = otpGenerator.generate();

        OtpToken token = new OtpToken();
        token.setIdentifier(identifier);
        token.setOtpCode(code);
        token.setPurpose(purpose);
        token.setExpiresAt(OffsetDateTime.now().plusMinutes(OTP_TTL_MINUTES));
        otpTokenRepository.save(token);

        if (otpDeliveryEnabled) {
            notificationService.send("OTP", recipientEmail, recipientPhone, Map.of("code", code));
        } else {
            log.info("[OTP DEV] identifier={} purpose={} code={}", identifier, purpose, code);
        }
    }

    @Transactional
    public void validate(String identifier, OtpPurpose purpose, String inputCode) {

        List<OtpToken> unused = otpTokenRepository
                .findByIdentifierAndPurposeAndUsedFalse(identifier, purpose);

        OtpToken token = unused.stream()
                .max(Comparator.comparing(OtpToken::getCreatedAt))
                .orElseThrow(() -> new ResourceNotFoundException("No active OTP found"));

        if (token.getExpiresAt().isBefore(OffsetDateTime.now())) {
            token.setUsed(true);
            otpTokenRepository.save(token);
            throw new OtpExpiredException("OTP has expired");
        }

        token.setAttempts(token.getAttempts() + 1);

        if (token.getAttempts() > MAX_ATTEMPTS) {
            token.setUsed(true);
            otpTokenRepository.save(token);
            throw new OtpMaxAttemptsException("Maximum OTP attempts exceeded");
        }

        if (!token.getOtpCode().equals(inputCode)) {
            otpTokenRepository.save(token);
            int attemptsLeft = MAX_ATTEMPTS - token.getAttempts();
            throw new InvalidOtpException("Invalid OTP code", attemptsLeft);
        }

        token.setUsed(true);
        otpTokenRepository.save(token);
    }

    public void resend(String identifier, OtpPurpose purpose,
                       String recipientEmail, String recipientPhone) {
        String key = identifier + ":" + purpose;
        Instant lastResend = resendRateLimitMap.get(key);

        if (lastResend != null &&
                Instant.now().isBefore(lastResend.plusSeconds(RESEND_COOLDOWN_SECONDS))) {
            throw new OtpMaxAttemptsException("Please wait 60 seconds before requesting a new OTP");
        }

        generate(identifier, purpose, recipientEmail, recipientPhone);
        resendRateLimitMap.put(key, Instant.now());
    }
}
