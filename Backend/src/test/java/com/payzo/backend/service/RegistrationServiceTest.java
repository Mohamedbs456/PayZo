package com.payzo.backend.service;

import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.enums.UserStatus;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.service.auth.OtpService;
import com.payzo.backend.service.auth.RegistrationService;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsClientData;
import com.payzo.backend.service.notification.InAppNotificationService;
import com.payzo.backend.util.UsernameGenerator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RegistrationServiceTest {

    @Mock private CbsIntegrationService cbsIntegrationService;
    @Mock private ClientRepository clientRepository;
    @Mock private UserRepository userRepository;
    @Mock private OtpService otpService;
    @Mock private InAppNotificationService inAppNotificationService;
    @Mock private UsernameGenerator usernameGenerator;

    @InjectMocks
    private RegistrationService registrationService;

    private static final String CIN = "12345678";
    private static final CbsClientData CBS_DATA =
            new CbsClientData("Mohamed", "Ben Salem", "m@payzo.tn", "+21650000000",
                    "Tunis", "1 Avenue Habib Bourguiba",
                    java.time.LocalDate.of(1990, 5, 18));

    // ── step1 ─────────────────────────────────────────────────────────────────

    @Test
    void step1_shouldGenerateOtp_whenCinIsNewToSystem() {
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.empty());
        when(cbsIntegrationService.getClientByCin(CIN)).thenReturn(CBS_DATA);

        registrationService.step1(CIN);

        verify(cbsIntegrationService).getClientByCin(CIN);
        verify(otpService).generate(eq(CIN), any(), eq(CBS_DATA.email()), eq(CBS_DATA.phone()));
    }

    @Test
    void step1_shouldThrowConflict_whenClientIsAlreadyActive() {
        Client active = clientWithStatus(UserStatus.ACTIVE);
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(active));

        assertThatThrownBy(() -> registrationService.step1(CIN))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("already registered");

        verifyNoInteractions(cbsIntegrationService, otpService);
    }

    @Test
    void step1_shouldThrowConflict_whenClientIsBlocked() {
        Client blocked = clientWithStatus(UserStatus.BLOCKED);
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(blocked));

        assertThatThrownBy(() -> registrationService.step1(CIN))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("blocked");

        verifyNoInteractions(cbsIntegrationService, otpService);
    }

    @Test
    void step1_shouldStillProceed_whenClientIsPending() {
        // PENDING means previous registration started but not yet approved — allow retry
        Client pending = clientWithStatus(UserStatus.PENDING);
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(pending));
        when(cbsIntegrationService.getClientByCin(CIN)).thenReturn(CBS_DATA);

        registrationService.step1(CIN);

        verify(otpService).generate(eq(CIN), any(), any(), any());
    }

    // ── step2 ─────────────────────────────────────────────────────────────────

    @Test
    void step2_shouldCreatePendingClient_whenCinIsNewToSystem() {
        when(cbsIntegrationService.getClientByCin(CIN)).thenReturn(CBS_DATA);
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.empty());
        when(usernameGenerator.generateFor(CBS_DATA.firstName(), CBS_DATA.lastName()))
                .thenReturn("mohamed.bensalem");
        when(userRepository.findByRole(any())).thenReturn(Collections.emptyList());

        registrationService.step2(CIN, "123456");

        verify(otpService).validate(eq(CIN), any(), eq("123456"));

        ArgumentCaptor<Client> captor = ArgumentCaptor.forClass(Client.class);
        verify(clientRepository).save(captor.capture());

        Client saved = captor.getValue();
        assertThat(saved.getCin()).isEqualTo(CIN);
        assertThat(saved.getUsername()).isEqualTo("mohamed.bensalem");
        assertThat(saved.getStatus()).isEqualTo(UserStatus.PENDING);
        assertThat(saved.getFirstName()).isEqualTo(CBS_DATA.firstName());
        assertThat(saved.getLastName()).isEqualTo(CBS_DATA.lastName());
        // Batch 9: email/phone/address/governorate are NOT cached locally — they live in CBS.
        assertThat(saved.getEmail()).isNull();
        assertThat(saved.getPhone()).isNull();
        assertThat(saved.getAddress()).isNull();
        assertThat(saved.getGovernorate()).isNull();
    }

    @Test
    void step2_shouldUpdateExistingRecord_whenClientWasRejected() {
        Client existing = clientWithStatus(UserStatus.REJECTED);
        existing.setCin(CIN);
        when(cbsIntegrationService.getClientByCin(CIN)).thenReturn(CBS_DATA);
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(existing));
        when(userRepository.findByRole(any())).thenReturn(Collections.emptyList());

        registrationService.step2(CIN, "123456");

        assertThat(existing.getStatus()).isEqualTo(UserStatus.PENDING);
        assertThat(existing.getFirstName()).isEqualTo(CBS_DATA.firstName());
        verify(clientRepository).save(existing);
    }

    @Test
    void step2_shouldThrowConflict_whenClientBecomesActiveBeforeStep2() {
        when(cbsIntegrationService.getClientByCin(CIN)).thenReturn(CBS_DATA);
        Client active = clientWithStatus(UserStatus.ACTIVE);
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(active));

        assertThatThrownBy(() -> registrationService.step2(CIN, "123456"))
                .isInstanceOf(ConflictException.class);
    }

    // ── getStatus ──────────────────────────────────────────────────────────────

    @Test
    void getStatus_shouldReturnClientStatus_whenFound() {
        Client client = clientWithStatus(UserStatus.PENDING);
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(client));

        UserStatus status = registrationService.getStatus(CIN);

        assertThat(status).isEqualTo(UserStatus.PENDING);
    }

    @Test
    void getStatus_shouldThrowNotFound_whenNoCinInSystem() {
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> registrationService.getStatus(CIN))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private Client clientWithStatus(UserStatus status) {
        Client client = new Client();
        client.setStatus(status);
        return client;
    }
}
