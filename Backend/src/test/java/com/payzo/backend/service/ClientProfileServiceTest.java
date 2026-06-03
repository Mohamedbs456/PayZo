package com.payzo.backend.service;

import com.payzo.backend.cbs.entity.CbsClient;
import com.payzo.backend.cbs.repository.CbsClientRepository;
import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.enums.UserStatus;
import com.payzo.backend.dto.client.ClientProfile;
import com.payzo.backend.exception.CbsClientNotFoundException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.service.client.ClientProfileService;
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
import static org.mockito.Mockito.when;

/**
 * Batch 9 — verifies that the helper assembles its result from BOTH sources:
 * PayZo-specific state from {@code users} and national identity from {@code cbs_clients}.
 */
@ExtendWith(MockitoExtension.class)
class ClientProfileServiceTest {

    @Mock private ClientRepository clientRepository;
    @Mock private CbsClientRepository cbsClientRepository;

    @InjectMocks
    private ClientProfileService service;

    private static final UUID CLIENT_ID = UUID.randomUUID();
    private static final String CIN = "12345678";

    @Test
    void getProfile_assemblesFromUsersAndCbs() {
        Client client = client();
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.of(client));
        when(cbsClientRepository.findByCin(CIN)).thenReturn(Optional.of(cbsClient()));

        ClientProfile profile = service.getProfile(CLIENT_ID);

        // From users (PayZo state, B-practical cache)
        assertThat(profile.id()).isEqualTo(CLIENT_ID);
        assertThat(profile.cin()).isEqualTo(CIN);
        assertThat(profile.username()).isEqualTo("sara.mansouri");
        assertThat(profile.firstName()).isEqualTo("Sara");
        assertThat(profile.lastName()).isEqualTo("Mansouri");
        assertThat(profile.trustScore()).isEqualTo(72);
        assertThat(profile.status()).isEqualTo(UserStatus.ACTIVE);

        // From CBS (national identity — never duplicated locally)
        assertThat(profile.email()).isEqualTo("sara@payzo.tn");
        assertThat(profile.phone()).isEqualTo("+21622145678");
        assertThat(profile.address()).isEqualTo("Avenue Habib Bourguiba");
        assertThat(profile.governorate()).isEqualTo("Monastir");
        assertThat(profile.dateOfBirth()).isEqualTo(LocalDate.of(1992, 8, 23));
    }

    @Test
    void getProfile_throwsResourceNotFound_whenClientMissing() {
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getProfile(CLIENT_ID))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining(CLIENT_ID.toString());
    }

    @Test
    void getProfile_throwsCbsClientNotFound_whenCbsLacksRecord() {
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.of(client()));
        when(cbsClientRepository.findByCin(CIN)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getProfile(CLIENT_ID))
                .isInstanceOf(CbsClientNotFoundException.class)
                .hasMessageContaining(CIN);
    }

    @Test
    void getProfileByCin_resolvesByCin() {
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(client()));
        when(cbsClientRepository.findByCin(CIN)).thenReturn(Optional.of(cbsClient()));

        ClientProfile profile = service.getProfileByCin(CIN);

        assertThat(profile.cin()).isEqualTo(CIN);
        assertThat(profile.email()).isEqualTo("sara@payzo.tn");
    }

    @Test
    void forClient_skipsPayZoLookup_whenEntityAlreadyLoaded() {
        Client client = client();
        when(cbsClientRepository.findByCin(CIN)).thenReturn(Optional.of(cbsClient()));

        ClientProfile profile = service.forClient(client);

        assertThat(profile.id()).isEqualTo(CLIENT_ID);
        assertThat(profile.email()).isEqualTo("sara@payzo.tn");
        // clientRepository was never invoked
    }

    private Client client() {
        Client c = new Client();
        c.setId(CLIENT_ID);
        c.setCin(CIN);
        c.setUsername("sara.mansouri");
        c.setFirstName("Sara");
        c.setLastName("Mansouri");
        c.setStatus(UserStatus.ACTIVE);
        c.setTrustScore(72);
        c.setFirstLoginCompleted(true);
        return c;
    }

    private CbsClient cbsClient() {
        return CbsClient.builder()
                .cin(CIN)
                .firstName("Sara")
                .lastName("Mansouri")
                .email("sara@payzo.tn")
                .phone("+21622145678")
                .address("Avenue Habib Bourguiba")
                .governorate("Monastir")
                .dateOfBirth(LocalDate.of(1992, 8, 23))
                .build();
    }
}
