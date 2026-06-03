package com.payzo.backend.service;

import com.payzo.backend.domain.entity.Beneficiary;
import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.dto.request.client.BeneficiaryCreateRequest;
import com.payzo.backend.dto.response.client.BeneficiaryResponse;
import com.payzo.backend.exception.CbsClientNotFoundException;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.exception.ValidationException;
import com.payzo.backend.repository.BeneficiaryRepository;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.service.client.BeneficiaryService;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsAccountData;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsClientData;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BeneficiaryServiceTest {

    @Mock private BeneficiaryRepository beneficiaryRepository;
    @Mock private ClientRepository clientRepository;
    @Mock private CbsIntegrationService cbsIntegrationService;

    @InjectMocks
    private BeneficiaryService service;

    private static final UUID CLIENT_ID = UUID.randomUUID();
    private static final String VALID_RIB = generateRib("10", "001", 1L);

    private Client owner;

    @BeforeEach
    void setUp() {
        owner = new Client();
        owner.setId(CLIENT_ID);
        owner.setCin("12345678");
    }

    // ── create ────────────────────────────────────────────────────────────────

    @Test
    void create_happyPath() {
        BeneficiaryCreateRequest req = req(VALID_RIB, "Hamza", "Trabelsi", "Mom");
        when(beneficiaryRepository.existsByClientIdAndAccountNumber(CLIENT_ID, VALID_RIB))
                .thenReturn(false);
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.of(owner));
        when(cbsIntegrationService.getAccountByNumber(VALID_RIB))
                .thenReturn(new CbsAccountData(VALID_RIB, "STB", "Société Tunisienne de Banque",
                        "CHECKING", new BigDecimal("1000"), "87654321", null));
        when(cbsIntegrationService.getClientByCin("87654321"))
                .thenReturn(new CbsClientData("Hamza", "Trabelsi", "h@x.tn", "+216", "Tunis", "Addr", null));

        BeneficiaryResponse result = service.create(CLIENT_ID, req);

        assertThat(result.getDisplayName()).isEqualTo("Mom"); // nickname wins over cached name
        ArgumentCaptor<Beneficiary> saved = ArgumentCaptor.forClass(Beneficiary.class);
        verify(beneficiaryRepository).save(saved.capture());
        Beneficiary persisted = saved.getValue();
        assertThat(persisted.getAccountNumber()).isEqualTo(VALID_RIB);
        assertThat(persisted.getCachedFirstName()).isEqualTo("Hamza");
        assertThat(persisted.getCachedLastName()).isEqualTo("Trabelsi");
        assertThat(persisted.getNickname()).isEqualTo("Mom");
        assertThat(persisted.getBankCode()).isEqualTo("STB");
        assertThat(persisted.isFavorite()).isFalse();
    }

    @Test
    void create_rejectsInvalidRib() {
        BeneficiaryCreateRequest req = req("12345", "Hamza", "Trabelsi", null);

        assertThatThrownBy(() -> service.create(CLIENT_ID, req))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Invalid RIB");
        verify(beneficiaryRepository, never()).save(any());
    }

    @Test
    void create_rejectsDuplicate() {
        BeneficiaryCreateRequest req = req(VALID_RIB, "Hamza", "Trabelsi", null);
        when(beneficiaryRepository.existsByClientIdAndAccountNumber(CLIENT_ID, VALID_RIB))
                .thenReturn(true);

        assertThatThrownBy(() -> service.create(CLIENT_ID, req))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> assertThat(((ConflictException) e).getErrorCode()).isEqualTo("BENEFICIARY_EXISTS"));
    }

    @Test
    void create_rejectsNameMismatch() {
        BeneficiaryCreateRequest req = req(VALID_RIB, "Karim", "Mejri", null);
        when(beneficiaryRepository.existsByClientIdAndAccountNumber(CLIENT_ID, VALID_RIB))
                .thenReturn(false);
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.of(owner));
        when(cbsIntegrationService.getAccountByNumber(VALID_RIB))
                .thenReturn(new CbsAccountData(VALID_RIB, "STB", "STB", "CHECKING", BigDecimal.ZERO, "87654321", null));
        when(cbsIntegrationService.getClientByCin("87654321"))
                .thenReturn(new CbsClientData("Hamza", "Trabelsi", "h@x.tn", "+216", "Tunis", null, null));

        assertThatThrownBy(() -> service.create(CLIENT_ID, req))
                .isInstanceOf(ValidationException.class)
                .satisfies(e -> assertThat(((ValidationException) e).getErrorCode()).isEqualTo("NAME_MISMATCH"));
    }

    // ── recordUsage ──────────────────────────────────────────────────────────

    @Test
    void recordUsage_firstTime_createsRowWithCountOneAndConfirmedAt() {
        when(beneficiaryRepository.findByClientIdAndAccountNumber(CLIENT_ID, VALID_RIB))
                .thenReturn(Optional.empty());
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.of(owner));

        service.recordUsage(CLIENT_ID, VALID_RIB, "Hamza", "Trabelsi", "STB", false, null);

        ArgumentCaptor<Beneficiary> saved = ArgumentCaptor.forClass(Beneficiary.class);
        verify(beneficiaryRepository).save(saved.capture());
        Beneficiary b = saved.getValue();
        assertThat(b.getTransferCount()).isEqualTo(1);
        assertThat(b.getConfirmedAt()).isNotNull();
        assertThat(b.getFirstUsedAt()).isNotNull();
        assertThat(b.getLastUsedAt()).isNotNull();
        assertThat(b.getNickname()).isNull();
    }

    @Test
    void recordUsage_repeat_incrementsCountAndRefreshesNames() {
        Beneficiary existing = new Beneficiary();
        existing.setId(UUID.randomUUID());
        existing.setAccountNumber(VALID_RIB);
        existing.setCachedFirstName("Old");
        existing.setCachedLastName("Name");
        existing.setTransferCount(3);
        existing.setConfirmedAt(OffsetDateTime.now().minusDays(7));
        existing.setFirstUsedAt(OffsetDateTime.now().minusDays(7));
        existing.setLastUsedAt(OffsetDateTime.now().minusDays(2));
        OffsetDateTime originalConfirmedAt = existing.getConfirmedAt();
        OffsetDateTime originalLastUsed = existing.getLastUsedAt();

        when(beneficiaryRepository.findByClientIdAndAccountNumber(CLIENT_ID, VALID_RIB))
                .thenReturn(Optional.of(existing));

        service.recordUsage(CLIENT_ID, VALID_RIB, "Hamza", "Trabelsi", "STB", false, null);

        assertThat(existing.getTransferCount()).isEqualTo(4);
        assertThat(existing.getCachedFirstName()).isEqualTo("Hamza");
        assertThat(existing.getCachedLastName()).isEqualTo("Trabelsi");
        // confirmedAt was already set — must not be overwritten on subsequent use.
        assertThat(existing.getConfirmedAt()).isEqualTo(originalConfirmedAt);
        // lastUsedAt should advance.
        assertThat(existing.getLastUsedAt()).isAfter(originalLastUsed);
    }

    // ── list (bubble-row enrichment) ─────────────────────────────────────────

    @Test
    void list_payzoRecipient_enrichesProfilePictureAndFlag() {
        Beneficiary b = beneficiaryRow(VALID_RIB, "Hamza", "Trabelsi");
        Page<Beneficiary> page = new PageImpl<>(List.of(b));
        when(beneficiaryRepository.findAllForClient(eq(CLIENT_ID), any(Pageable.class))).thenReturn(page);

        CbsAccountData account = new CbsAccountData(VALID_RIB, "STB", "STB", "CHECKING",
                new BigDecimal("500"), "87654321", null);
        when(cbsIntegrationService.getAccountsByNumbers(anyCollection()))
                .thenReturn(Map.of(VALID_RIB, account));

        Client recipient = new Client();
        recipient.setCin("87654321");
        recipient.setProfilePictureUrl("/api/v1/uploads/profile-pictures/abc.jpg");
        when(clientRepository.findByCinIn(anyCollection())).thenReturn(List.of(recipient));

        Page<BeneficiaryResponse> result = service.list(CLIENT_ID, PageRequest.of(0, 20));

        assertThat(result.getContent()).hasSize(1);
        BeneficiaryResponse row = result.getContent().get(0);
        assertThat(row.isPayzoUser()).isTrue();
        assertThat(row.getProfilePictureUrl()).isEqualTo("/api/v1/uploads/profile-pictures/abc.jpg");
        assertThat(row.getDisplayName()).isEqualTo("Hamza Trabelsi");
        assertThat(row.getBankCode()).isEqualTo("STB");
    }

    @Test
    void list_nonPayZoRecipient_leavesProfileFieldsNull() {
        Beneficiary b = beneficiaryRow(VALID_RIB, "Hamza", "Trabelsi");
        Page<Beneficiary> page = new PageImpl<>(List.of(b));
        when(beneficiaryRepository.findAllForClient(eq(CLIENT_ID), any(Pageable.class))).thenReturn(page);

        CbsAccountData account = new CbsAccountData(VALID_RIB, "STB", "STB", "CHECKING",
                new BigDecimal("500"), "99999999", null);
        when(cbsIntegrationService.getAccountsByNumbers(anyCollection()))
                .thenReturn(Map.of(VALID_RIB, account));
        // Non-PayZo: findByCinIn returns nothing for this CIN.
        when(clientRepository.findByCinIn(anyCollection())).thenReturn(List.of());

        Page<BeneficiaryResponse> result = service.list(CLIENT_ID, PageRequest.of(0, 20));

        BeneficiaryResponse row = result.getContent().get(0);
        assertThat(row.isPayzoUser()).isFalse();
        assertThat(row.getProfilePictureUrl()).isNull();
        // Existing fields still populated.
        assertThat(row.getDisplayName()).isEqualTo("Hamza Trabelsi");
        assertThat(row.getBankCode()).isEqualTo("STB");
    }

    @Test
    void list_cbsLookupThrows_swallowsAndStillRenders() {
        Beneficiary b = beneficiaryRow(VALID_RIB, "Hamza", "Trabelsi");
        Page<Beneficiary> page = new PageImpl<>(List.of(b));
        when(beneficiaryRepository.findAllForClient(eq(CLIENT_ID), any(Pageable.class))).thenReturn(page);

        when(cbsIntegrationService.getAccountsByNumbers(anyCollection()))
                .thenThrow(new CbsClientNotFoundException("CBS unreachable"));

        Page<BeneficiaryResponse> result = service.list(CLIENT_ID, PageRequest.of(0, 20));

        BeneficiaryResponse row = result.getContent().get(0);
        // Enrichment failed silently — row still renders with the cached fields.
        assertThat(row.isPayzoUser()).isFalse();
        assertThat(row.getProfilePictureUrl()).isNull();
        assertThat(row.getDisplayName()).isEqualTo("Hamza Trabelsi");
        assertThat(row.getBankCode()).isEqualTo("STB");
        // The PayZo client lookup must be skipped entirely (no CINs to resolve).
        verify(clientRepository, never()).findByCinIn(anyCollection());
    }

    // ── toggleFavorite ───────────────────────────────────────────────────────

    @Test
    void toggleFavorite_flipsBoolean() {
        Beneficiary b = new Beneficiary();
        b.setId(UUID.randomUUID());
        b.setAccountNumber(VALID_RIB);
        b.setCachedFirstName("Hamza");
        b.setCachedLastName("Trabelsi");
        b.setFavorite(false);
        when(beneficiaryRepository.findByIdAndClientId(b.getId(), CLIENT_ID))
                .thenReturn(Optional.of(b));

        service.toggleFavorite(CLIENT_ID, b.getId());
        assertThat(b.isFavorite()).isTrue();

        service.toggleFavorite(CLIENT_ID, b.getId());
        assertThat(b.isFavorite()).isFalse();
    }

    private static Beneficiary beneficiaryRow(String rib, String first, String last) {
        Beneficiary b = new Beneficiary();
        b.setId(UUID.randomUUID());
        b.setAccountNumber(rib);
        b.setCachedFirstName(first);
        b.setCachedLastName(last);
        b.setBankCode("STB");
        b.setFavorite(true);
        b.setTransferCount(0);
        b.setCreatedAt(OffsetDateTime.now());
        return b;
    }

    private static BeneficiaryCreateRequest req(String rib, String first, String last, String nickname) {
        BeneficiaryCreateRequest r = new BeneficiaryCreateRequest();
        r.setRib(rib);
        r.setFirstName(first);
        r.setLastName(last);
        r.setNickname(nickname);
        return r;
    }

    private static String generateRib(String numericBankCode, String branchCode, long accountSeq) {
        String first18 = numericBankCode + branchCode + String.format("%013d", accountSeq);
        int rem = new BigInteger(first18 + "00").mod(BigInteger.valueOf(97)).intValue();
        int key = (rem == 0) ? 0 : (97 - rem);
        return first18 + String.format("%02d", key);
    }
}
