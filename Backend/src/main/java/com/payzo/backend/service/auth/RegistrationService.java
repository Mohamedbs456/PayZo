package com.payzo.backend.service.auth;

import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.entity.User;
import com.payzo.backend.domain.enums.OtpChannel;
import com.payzo.backend.domain.enums.OtpPurpose;
import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.domain.enums.UserNotificationType;
import com.payzo.backend.domain.enums.UserStatus;
import com.payzo.backend.dto.response.auth.RegistrationPreviewResponse;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsClientData;
import com.payzo.backend.service.notification.InAppNotificationService;
import com.payzo.backend.util.OtpDestinationMasker;
import com.payzo.backend.util.UsernameGenerator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * Self-signup pipeline: step1 fetches the CIN's profile from CBS and dispatches
 * an OTP, step2 verifies the OTP and persists a PENDING_APPROVAL Client row.
 * The Keycloak user is NOT created here. An admin approves the pending row
 * later via SubscriptionService, and that approval is what triggers the
 * Keycloak create plus the status flip to ACTIVE.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RegistrationService {

    private final CbsIntegrationService cbsIntegrationService;
    private final ClientRepository clientRepository;
    private final UserRepository userRepository;
    private final OtpService otpService;
    private final InAppNotificationService inAppNotificationService;
    private final UsernameGenerator usernameGenerator;

    @Transactional
    public void step1(String cin) {
        // Legacy path — preserved for back-compat with internal callers
        // that don't yet specify a delivery channel. The new FE flow
        // splits this into preview() + sendOtp(channel) below.
        assertCinNotRegistered(cin);
        CbsClientData cbsClient = cbsIntegrationService.getClientByCin(cin);
        otpService.generate(cin, OtpPurpose.REGISTRATION,
                cbsClient.email(), cbsClient.phone());
        log.info("Registration step1 completed: CIN={}", cin);
    }

    /**
     * Step 1 of the new 3-step signup flow: pull the user's identity from
     * CBS so the "Verify your identity" page can render a read-only preview
     * card. Email and phone are masked here so the FE never sees raw
     * contact details before the user has confirmed the CIN matches.
     *
     * <p>Throws:
     * <ul>
     *   <li>404 ({@link ResourceNotFoundException}) — CIN not in CBS;
     *   <li>409 ({@link ConflictException}) — CIN already has a PayZo
     *       account in {@code ACTIVE / ACCEPTED / BLOCKED}.
     * </ul>
     * No OTP is dispatched — that happens in {@link #sendOtp}.
     */
    @Transactional(readOnly = true)
    public RegistrationPreviewResponse preview(String cin) {
        assertCinNotRegistered(cin);
        CbsClientData cbsClient = cbsIntegrationService.getClientByCin(cin);
        return new RegistrationPreviewResponse(
                cbsClient.firstName(),
                cbsClient.lastName(),
                cin,
                OtpDestinationMasker.maskEmail(cbsClient.email()),
                OtpDestinationMasker.maskPhone(cbsClient.phone()),
                cbsClient.governorate());
    }

    /**
     * Step 2a of the new flow: dispatch the OTP via the channel the user
     * picked on {@code /signup/channel}. Same defensive checks as
     * {@link #step1} (existing-client guard + CBS lookup), but the OTP
     * goes to exactly one of email/SMS — never both.
     */
    @Transactional
    public void sendOtp(String cin, OtpChannel channel) {
        assertCinNotRegistered(cin);
        CbsClientData cbsClient = cbsIntegrationService.getClientByCin(cin);

        String email = channel == OtpChannel.EMAIL ? cbsClient.email() : null;
        String phone = channel == OtpChannel.SMS ? cbsClient.phone() : null;
        otpService.generate(cin, OtpPurpose.REGISTRATION, email, phone);

        log.info("Registration sendOtp: CIN={} channel={}", cin, channel);
    }

    private void assertCinNotRegistered(String cin) {
        Optional<Client> existing = clientRepository.findByCin(cin);
        if (existing.isPresent()) {
            UserStatus status = existing.get().getStatus();
            if (status == UserStatus.ACTIVE || status == UserStatus.ACCEPTED) {
                throw new ConflictException("This CIN is already registered", "CIN_ALREADY_REGISTERED");
            }
            if (status == UserStatus.BLOCKED) {
                throw new ConflictException("This account has been blocked. Contact support.",
                        "CIN_ALREADY_REGISTERED");
            }
        }
    }

    @Transactional
    public void step2(String cin, String otpCode) {
        otpService.validate(cin, OtpPurpose.REGISTRATION, otpCode);

        CbsClientData cbsClient = cbsIntegrationService.getClientByCin(cin);

        Optional<Client> existing = clientRepository.findByCin(cin);

        if (existing.isPresent()) {
            Client client = existing.get();
            if (client.getStatus() == UserStatus.ACTIVE || client.getStatus() == UserStatus.ACCEPTED) {
                throw new ConflictException("This CIN is already registered", "CIN_ALREADY_REGISTERED");
            }
            // Batch 9: only firstName/lastName cached locally (for search). Email/phone/
            // address/governorate stay in CBS — fetched on demand via ClientProfileService.
            client.setFirstName(cbsClient.firstName());
            client.setLastName(cbsClient.lastName());
            client.setStatus(UserStatus.PENDING);
            clientRepository.save(client);
            log.info("Registration step2: updated existing record to PENDING for CIN={}", cin);
        } else {
            Client client = new Client();
            client.setCin(cin);
            client.setUsername(usernameGenerator.generateFor(cbsClient.firstName(), cbsClient.lastName()));
            client.setFirstName(cbsClient.firstName());
            client.setLastName(cbsClient.lastName());
            client.setStatus(UserStatus.PENDING);
            clientRepository.save(client);
            log.info("Registration step2: created PENDING client for CIN={}", cin);
        }

        // Notify all admins about the new pending registration
        String clientName = cbsClient.firstName() + " " + cbsClient.lastName();
        List<User> admins = userRepository.findByRole(Role.ADMIN);
        for (User admin : admins) {
            inAppNotificationService.create(admin.getId(), "New pending registration",
                    clientName + " submitted a registration request.",
                    UserNotificationType.NEW_PENDING_REGISTRATION);
        }
    }

    @Transactional(readOnly = true)
    public UserStatus getStatus(String cin) {
        Client client = clientRepository.findByCin(cin)
                .orElseThrow(() -> new ResourceNotFoundException("No registration found for CIN: " + cin));
        return client.getStatus();
    }
}
