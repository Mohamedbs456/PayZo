package com.payzo.backend.service;

import com.payzo.backend.cbs.repository.CbsAccountRepository;
import com.payzo.backend.cbs.repository.CbsTransactionRepository;
import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.enums.UserStatus;
import com.payzo.backend.dto.client.ClientProfile;
import com.payzo.backend.dto.response.client.ProfileResponse;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.exception.UnprocessableEntityException;
import com.payzo.backend.mapper.TransactionMapper;
import com.payzo.backend.repository.BankRepository;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.repository.FraudAlertRepository;
import com.payzo.backend.repository.TransactionRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.service.audit.AuditService;
import com.payzo.backend.service.client.ClientProfileService;
import com.payzo.backend.service.client.ClientService;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.KeycloakAdminService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers {@link ClientService#updateUsername(UUID, String)} — D54 / Impact 34.
 *
 * <p>Five paths are exercised: happy path, idempotent same-value, format
 * violation (422), reserved name (409), case-insensitive collision (409).
 */
@ExtendWith(MockitoExtension.class)
class ClientServiceUsernameTest {

    @Mock private ClientRepository clientRepository;
    @Mock private TransactionRepository transactionRepository;
    @Mock private FraudAlertRepository fraudAlertRepository;
    @Mock private BankRepository bankRepository;
    @Mock private UserRepository userRepository;
    @Mock private CbsIntegrationService cbsIntegrationService;
    @Mock private CbsTransactionRepository cbsTransactionRepository;
    @Mock private CbsAccountRepository cbsAccountRepository;
    @Mock private ClientProfileService clientProfileService;
    @Mock private KeycloakAdminService keycloakAdminService;
    @Mock private AuditService auditService;
    @Mock private TransactionMapper transactionMapper;

    @InjectMocks
    private ClientService service;

    private static final UUID CLIENT_ID = UUID.randomUUID();
    private static final String CURRENT_USERNAME = "ahmed.bensalem";

    private Client client;

    @BeforeEach
    void setUp() {
        client = new Client();
        client.setId(CLIENT_ID);
        client.setCin("12345678");
        client.setUsername(CURRENT_USERNAME);
        client.setFirstName("Ahmed");
        client.setLastName("Ben Salem");
        client.setStatus(UserStatus.ACTIVE);
        client.setDefaultAccountId("10001001000000000178"); // non-null → backfill path skipped
    }

    @Test
    void updateUsername_happyPath_persistsLowercaseAndAudits() {
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.of(client));
        when(userRepository.existsByUsernameIgnoreCase("ahmed.dev")).thenReturn(false);
        // Re-read after save. ClientService.getProfile() goes through ClientProfileService,
        // not back to clientRepository, so we stub that directly.
        when(clientProfileService.getProfile(CLIENT_ID))
                .thenReturn(profileWithUsername("ahmed.dev"));

        ProfileResponse result = service.updateUsername(CLIENT_ID, "ahmed.dev");

        assertThat(client.getUsername()).isEqualTo("ahmed.dev");
        assertThat(result.getUsername()).isEqualTo("ahmed.dev");
        verify(clientRepository).save(client);
        verify(auditService).writeLog(
                eq(CLIENT_ID), eq("CLIENT"), eq("USERNAME_CHANGED"),
                eq("USER"), eq(CLIENT_ID), anyString());
    }

    @Test
    void updateUsername_normalizesLeadingAtAndUppercase() {
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.of(client));
        when(userRepository.existsByUsernameIgnoreCase("coffee.forever")).thenReturn(false);
        when(clientProfileService.getProfile(CLIENT_ID))
                .thenReturn(profileWithUsername("coffee.forever"));

        ProfileResponse result = service.updateUsername(CLIENT_ID, "  @Coffee.Forever ");

        assertThat(client.getUsername()).isEqualTo("coffee.forever");
        assertThat(result.getUsername()).isEqualTo("coffee.forever");
    }

    @Test
    void updateUsername_sameValue_isIdempotent_noWrite_noAudit() {
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.of(client));
        when(clientProfileService.getProfile(CLIENT_ID))
                .thenReturn(profileWithUsername(CURRENT_USERNAME));

        ProfileResponse result = service.updateUsername(CLIENT_ID, CURRENT_USERNAME);

        assertThat(result.getUsername()).isEqualTo(CURRENT_USERNAME);
        verify(clientRepository, never()).save(any());
        verify(auditService, never()).writeLog(
                any(), anyString(), anyString(), anyString(), any(), anyString());
        // Mixed case of the same value is also a no-op.
        verify(userRepository, never()).existsByUsernameIgnoreCase(anyString());
    }

    @Test
    void updateUsername_invalidFormat_throws422() {
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.of(client));

        // Starts with a digit — fails the regex.
        assertThatThrownBy(() -> service.updateUsername(CLIENT_ID, "1coffee"))
                .isInstanceOf(UnprocessableEntityException.class)
                .hasFieldOrPropertyWithValue("errorCode", "USERNAME_INVALID");

        verify(clientRepository, never()).save(any());
        verify(auditService, never()).writeLog(
                any(), anyString(), anyString(), anyString(), any(), anyString());
    }

    @Test
    void updateUsername_tooShort_throws422() {
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.of(client));

        assertThatThrownBy(() -> service.updateUsername(CLIENT_ID, "ab"))
                .isInstanceOf(UnprocessableEntityException.class)
                .hasFieldOrPropertyWithValue("errorCode", "USERNAME_INVALID");
    }

    @Test
    void updateUsername_reserved_throws409() {
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.of(client));

        assertThatThrownBy(() -> service.updateUsername(CLIENT_ID, "admin"))
                .isInstanceOf(ConflictException.class)
                .hasFieldOrPropertyWithValue("errorCode", "USERNAME_RESERVED");

        verify(userRepository, never()).existsByUsernameIgnoreCase(anyString());
        verify(clientRepository, never()).save(any());
    }

    @Test
    void updateUsername_taken_throws409_caseInsensitive() {
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.of(client));
        when(userRepository.existsByUsernameIgnoreCase("karim.trabelsi")).thenReturn(true);

        assertThatThrownBy(() -> service.updateUsername(CLIENT_ID, "Karim.Trabelsi"))
                .isInstanceOf(ConflictException.class)
                .hasFieldOrPropertyWithValue("errorCode", "USERNAME_TAKEN");

        verify(clientRepository, never()).save(any());
    }

    @Test
    void updateUsername_clientMissing_throwsResourceNotFound() {
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.updateUsername(CLIENT_ID, "ahmed.dev"))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    private ClientProfile profileWithUsername(String username) {
        return new ClientProfile(
                CLIENT_ID,
                UUID.randomUUID(),
                "12345678",
                username,
                "Ahmed",
                "Ben Salem",
                null,
                50,
                "10001001000000000178",
                UserStatus.ACTIVE,
                true,
                "ahmed@payzo.tn",
                "+21622000000",
                "Avenue Habib Bourguiba",
                "Monastir",
                LocalDate.of(1995, 1, 1)
        );
    }
}
