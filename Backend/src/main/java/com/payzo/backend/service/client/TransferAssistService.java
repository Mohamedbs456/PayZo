package com.payzo.backend.service.client;

import com.payzo.backend.domain.entity.Bank;
import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.entity.User;
import com.payzo.backend.domain.enums.UserStatus;
import com.payzo.backend.dto.response.client.NameVerifyResponse;
import com.payzo.backend.dto.response.client.RibResolveResponse;
import com.payzo.backend.dto.response.client.UsernameResolveResponse;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.exception.ValidationException;
import com.payzo.backend.repository.BankRepository;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsAccountData;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsClientData;
import com.payzo.backend.util.NameMatcher;
import com.payzo.backend.util.RibValidator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * Backs the three pre-transfer assist endpoints used by Send Money:
 * <ul>
 *   <li>{@link #resolveRib}: validate a 20-digit RIB + return bank info + masked
 *       holder initials (RIB path on the picker).</li>
 *   <li>{@link #verifyName}: typed-name match against CBS (RIB path's confirm step),
 *       rate-limited per (clientId, RIB) to prevent name fishing.</li>
 *   <li>{@link #resolveUsername}: username → recipient's defaultAccountId → bank +
 *       cached name + trust score (PayZo-username path's confirm card). Rate-limited
 *       per sender to prevent username enumeration (D53).</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TransferAssistService {

    private static final int MAX_VERIFY_ATTEMPTS_PER_HOUR = 5;
    private static final int MAX_USERNAME_RESOLVES_PER_HOUR = 30;
    private static final long WINDOW_MS = 60 * 60 * 1000L;

    private final CbsIntegrationService cbsIntegrationService;
    private final BankRepository bankRepository;
    private final ClientRepository clientRepository;
    private final UserRepository userRepository;

    /** Sliding-window attempt tracker — keyed by {@code clientId|rib}. */
    private final ConcurrentMap<String, AttemptWindow> verifyAttempts = new ConcurrentHashMap<>();

    /** Sliding-window attempt tracker for username lookups — keyed by {@code clientId|resolveUsername}. */
    private final ConcurrentMap<String, AttemptWindow> usernameResolveAttempts = new ConcurrentHashMap<>();

    @Transactional(readOnly = true)
    public RibResolveResponse resolveRib(UUID senderClientId, String rawRib) {
        String rib = RibValidator.normalize(rawRib);
        if (!RibValidator.isValid(rib)) {
            throw new ValidationException("Invalid RIB", "INVALID_RIB");
        }

        Client sender = clientRepository.findById(senderClientId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + senderClientId));

        CbsAccountData account = cbsIntegrationService.getAccountByNumber(rib);

        if (sender.getCin() != null && sender.getCin().equals(account.clientCin())) {
            throw new ValidationException("You cannot transfer to your own account", "CANNOT_TRANSFER_TO_SELF");
        }

        String numericBankCode = RibValidator.extractNumericBankCode(rib);
        Bank bank = bankRepository.findAll().stream()
                .filter(b -> numericBankCode.equals(b.getNumericCode()))
                .findFirst()
                .orElseThrow(() -> new ValidationException(
                        "Bank with numeric code " + numericBankCode + " is not registered",
                        "BANK_NOT_REGISTERED"));

        if (!bank.isActive()) {
            throw new ConflictException(
                    "Transfers to " + bank.getName() + " are not currently supported",
                    "BANK_INACTIVE");
        }

        CbsClientData holder = cbsIntegrationService.getClientByCin(account.clientCin());
        boolean payzoUser = clientRepository.findByCin(account.clientCin()).isPresent();

        return RibResolveResponse.builder()
                .bankCode(bank.getCode())
                .bankName(bank.getName())
                .bankNumericCode(bank.getNumericCode())
                .firstNameMasked(mask(holder.firstName()))
                .lastNameMasked(mask(holder.lastName()))
                .payzoUser(payzoUser)
                .build();
    }

    @Transactional(readOnly = true)
    public NameVerifyResponse verifyName(UUID senderClientId, String rawRib,
                                          String firstName, String lastName) {
        String rib = RibValidator.normalize(rawRib);
        if (!RibValidator.isValid(rib)) {
            throw new ValidationException("Invalid RIB", "INVALID_RIB");
        }

        AttemptWindow window = verifyAttempts.compute(senderClientId + "|" + rib,
                (k, w) -> (w == null || w.expired()) ? new AttemptWindow() : w);
        if (window.attempts >= MAX_VERIFY_ATTEMPTS_PER_HOUR) {
            throw new ConflictException(
                    "Too many name verification attempts on this RIB. Try again later.",
                    "VERIFY_NAME_RATE_LIMIT");
        }
        window.attempts++;

        CbsAccountData account = cbsIntegrationService.getAccountByNumber(rib);
        CbsClientData holder = cbsIntegrationService.getClientByCin(account.clientCin());

        boolean matched = NameMatcher.matches(firstName, holder.firstName())
                && NameMatcher.matches(lastName, holder.lastName());

        int remaining = Math.max(0, MAX_VERIFY_ATTEMPTS_PER_HOUR - window.attempts);
        return NameVerifyResponse.builder()
                .matched(matched)
                .attemptsRemaining(remaining)
                .build();
    }

    /**
     * Resolve a PayZo username to the recipient's confirmation-card data. Used by
     * the PayZo-username picker tab on Send Money (D53).
     *
     * <p>Backend re-runs the same defensive checks here that {@code TransferService.initiateTransfer}
     * does for the username path — so a stale/replayed resolve response can't get
     * money to a recipient whose bank was deactivated or default-account was cleared
     * between resolve and submit.
     */
    @Transactional(readOnly = true)
    public UsernameResolveResponse resolveUsername(UUID senderClientId, String rawUsername) {
        AttemptWindow window = usernameResolveAttempts.compute(
                senderClientId + "|resolveUsername",
                (k, w) -> (w == null || w.expired()) ? new AttemptWindow() : w);
        if (window.attempts >= MAX_USERNAME_RESOLVES_PER_HOUR) {
            throw new ConflictException(
                    "Too many username lookups. Try again in an hour.",
                    "RESOLVE_USERNAME_RATE_LIMIT");
        }
        window.attempts++;

        String username = normalizeUsername(rawUsername);
        if (username == null || username.isEmpty()) {
            throw new ResourceNotFoundException("No PayZo user with this username");
        }

        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("No PayZo user with this username"));
        if (!(user instanceof Client recipient) || recipient.getStatus() != UserStatus.ACTIVE) {
            // Same 404 for non-Client + non-ACTIVE so the endpoint doesn't reveal staff
            // usernames or pending-rejection state to anyone with a Client account.
            throw new ResourceNotFoundException("No PayZo user with this username");
        }
        if (recipient.getId().equals(senderClientId)) {
            throw new ValidationException("You cannot transfer to yourself", "CANNOT_TRANSFER_TO_SELF");
        }

        String rib = recipient.getDefaultAccountId();
        if (rib == null || rib.isBlank()) {
            throw new ConflictException(
                    "Recipient has no default account",
                    "RECIPIENT_NO_DEFAULT_ACCOUNT");
        }

        // Defense check: the cached defaultAccountId might point at a CBS account
        // that's since been removed. Fail at resolve time rather than later in the
        // transfer pipeline.
        cbsIntegrationService.getAccountByNumber(rib);

        String numericCode = RibValidator.extractNumericBankCode(rib);
        Bank bank = bankRepository.findAll().stream()
                .filter(b -> numericCode.equals(b.getNumericCode()))
                .findFirst()
                .orElseThrow(() -> new ValidationException(
                        "Recipient's bank is not registered",
                        "BANK_NOT_REGISTERED"));
        if (!bank.isActive()) {
            throw new ConflictException(
                    "Transfers to " + bank.getName() + " are not currently supported",
                    "BANK_INACTIVE");
        }

        return UsernameResolveResponse.builder()
                .username(recipient.getUsername())
                .firstName(recipient.getFirstName())
                .lastName(recipient.getLastName())
                .profilePictureUrl(recipient.getProfilePictureUrl())
                .trustScore(recipient.getTrustScore())
                .accountNumberMasked(maskRib(rib))
                .bankCode(bank.getCode())
                .bankName(bank.getName())
                .build();
    }

    private static String normalizeUsername(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.startsWith("@") ? t.substring(1) : t;
    }

    private static String mask(String name) {
        if (name == null || name.isEmpty()) return "";
        char first = Character.toUpperCase(name.charAt(0));
        int stars = Math.min(4, Math.max(1, name.length() - 1));
        return first + "*".repeat(stars);
    }

    /** Mask a 20-digit RIB as {@code BB AAA ************* CC} — visible bank, branch, and check digit. */
    private static String maskRib(String rib) {
        String s = RibValidator.normalize(rib);
        if (s == null || s.length() != 20) return "****";
        return s.substring(0, 2) + " " + s.substring(2, 5) + " "
                + "*".repeat(13) + " " + s.substring(18, 20);
    }

    /** Simple sliding hour window — first attempt anchors the window's start. */
    private static final class AttemptWindow {
        final long startedAtMs = Instant.now().toEpochMilli();
        int attempts = 0;

        boolean expired() {
            return Instant.now().toEpochMilli() - startedAtMs > WINDOW_MS;
        }
    }
}
