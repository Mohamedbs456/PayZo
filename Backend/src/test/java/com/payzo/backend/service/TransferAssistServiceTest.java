package com.payzo.backend.service;

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
import com.payzo.backend.service.client.TransferAssistService;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsAccountData;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsClientData;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TransferAssistServiceTest {

    @Mock private CbsIntegrationService cbsIntegrationService;
    @Mock private BankRepository bankRepository;
    @Mock private ClientRepository clientRepository;
    @Mock private UserRepository userRepository;

    @InjectMocks
    private TransferAssistService assistService;

    private static final UUID SENDER_ID = UUID.randomUUID();
    private static final String DEST_RIB = generateRib("10", "001", 7L);   // STB
    private static final String SENDER_CIN = "12345678";
    private static final String DEST_CIN = "87654321";

    private Client sender;
    private Bank stb;

    @BeforeEach
    void setUp() {
        sender = new Client();
        sender.setId(SENDER_ID);
        sender.setCin(SENDER_CIN);

        stb = new Bank();
        stb.setId(UUID.randomUUID());
        stb.setCode("STB");
        stb.setNumericCode("10");
        stb.setName("Société Tunisienne de Banque");
        stb.setActive(true);
    }

    // ── resolveRib ───────────────────────────────────────────────────────────

    @Test
    void resolveRib_happyPath_returnsBankAndMaskedNames() {
        stubResolveDeps();

        RibResolveResponse r = assistService.resolveRib(SENDER_ID, DEST_RIB);

        assertThat(r.getBankCode()).isEqualTo("STB");
        assertThat(r.getBankName()).isEqualTo("Société Tunisienne de Banque");
        assertThat(r.getBankNumericCode()).isEqualTo("10");
        assertThat(r.getFirstNameMasked()).startsWith("H");
        assertThat(r.getLastNameMasked()).startsWith("T");
        // No exact name leakage.
        assertThat(r.getFirstNameMasked()).isNotEqualTo("Hamza");
    }

    @Test
    void resolveRib_invalidRib_throwsValidation() {
        // RIB validation happens before any DB lookup — no stubbing required.
        assertThatThrownBy(() -> assistService.resolveRib(SENDER_ID, "12345"))
                .isInstanceOf(ValidationException.class)
                .satisfies(e -> assertThat(((ValidationException) e).getErrorCode()).isEqualTo("INVALID_RIB"));
    }

    @Test
    void resolveRib_selfTransfer_throwsValidation() {
        when(clientRepository.findById(SENDER_ID)).thenReturn(Optional.of(sender));
        when(cbsIntegrationService.getAccountByNumber(DEST_RIB))
                .thenReturn(new CbsAccountData(DEST_RIB, "STB", "STB", "CHECKING", BigDecimal.ZERO, SENDER_CIN, null));

        assertThatThrownBy(() -> assistService.resolveRib(SENDER_ID, DEST_RIB))
                .isInstanceOf(ValidationException.class)
                .satisfies(e -> assertThat(((ValidationException) e).getErrorCode()).isEqualTo("CANNOT_TRANSFER_TO_SELF"));
    }

    @Test
    void resolveRib_bankNotRegistered_throwsValidation() {
        when(clientRepository.findById(SENDER_ID)).thenReturn(Optional.of(sender));
        when(cbsIntegrationService.getAccountByNumber(DEST_RIB))
                .thenReturn(new CbsAccountData(DEST_RIB, "STB", "STB", "CHECKING", BigDecimal.ZERO, DEST_CIN, null));
        when(bankRepository.findAll()).thenReturn(List.of()); // no banks registered in PayZo

        assertThatThrownBy(() -> assistService.resolveRib(SENDER_ID, DEST_RIB))
                .isInstanceOf(ValidationException.class)
                .satisfies(e -> assertThat(((ValidationException) e).getErrorCode()).isEqualTo("BANK_NOT_REGISTERED"));
    }

    @Test
    void resolveRib_bankInactive_throwsConflict() {
        stb.setActive(false);
        when(clientRepository.findById(SENDER_ID)).thenReturn(Optional.of(sender));
        when(cbsIntegrationService.getAccountByNumber(DEST_RIB))
                .thenReturn(new CbsAccountData(DEST_RIB, "STB", "STB", "CHECKING", BigDecimal.ZERO, DEST_CIN, null));
        when(bankRepository.findAll()).thenReturn(List.of(stb));

        assertThatThrownBy(() -> assistService.resolveRib(SENDER_ID, DEST_RIB))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> assertThat(((ConflictException) e).getErrorCode()).isEqualTo("BANK_INACTIVE"));
    }

    // ── verifyName ───────────────────────────────────────────────────────────

    @Test
    void verifyName_matched() {
        stubVerifyDeps();
        NameVerifyResponse r = assistService.verifyName(SENDER_ID, DEST_RIB, "Hamza", "Trabelsi");
        assertThat(r.isMatched()).isTrue();
    }

    @Test
    void verifyName_caseAndAccentInsensitive() {
        stubVerifyDeps();
        NameVerifyResponse r = assistService.verifyName(SENDER_ID, DEST_RIB, "HAMZA", "trabelsi");
        assertThat(r.isMatched()).isTrue();
    }

    @Test
    void verifyName_mismatch() {
        stubVerifyDeps();
        NameVerifyResponse r = assistService.verifyName(SENDER_ID, DEST_RIB, "Karim", "Mejri");
        assertThat(r.isMatched()).isFalse();
        assertThat(r.getAttemptsRemaining()).isEqualTo(4);
    }

    @Test
    void verifyName_sixthAttemptIsRateLimited() {
        stubVerifyDeps();
        // First 5 attempts are allowed (whether they match or not).
        for (int i = 0; i < 5; i++) {
            assistService.verifyName(SENDER_ID, DEST_RIB, "Karim", "Mejri");
        }
        assertThatThrownBy(() ->
                assistService.verifyName(SENDER_ID, DEST_RIB, "Karim", "Mejri"))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> assertThat(((ConflictException) e).getErrorCode()).isEqualTo("VERIFY_NAME_RATE_LIMIT"));
    }

    // ── resolveUsername (D53) ────────────────────────────────────────────────

    @Test
    void resolveUsername_happyPath_returnsRecipientCard() {
        Client recipient = buildActiveRecipient("hamza.trabelsi", DEST_CIN, DEST_RIB,
                "Hamza", "Trabelsi", 78);
        when(userRepository.findByUsername("hamza.trabelsi")).thenReturn(Optional.of(recipient));
        when(cbsIntegrationService.getAccountByNumber(DEST_RIB))
                .thenReturn(new CbsAccountData(DEST_RIB, "STB", "STB", "CHECKING", BigDecimal.ZERO, DEST_CIN, null));
        when(bankRepository.findAll()).thenReturn(List.of(stb));

        UsernameResolveResponse r = assistService.resolveUsername(SENDER_ID, "hamza.trabelsi");

        assertThat(r.getUsername()).isEqualTo("hamza.trabelsi");
        assertThat(r.getFirstName()).isEqualTo("Hamza");
        assertThat(r.getLastName()).isEqualTo("Trabelsi");
        assertThat(r.getTrustScore()).isEqualTo(78);
        assertThat(r.getBankCode()).isEqualTo("STB");
        assertThat(r.getBankName()).isEqualTo("Société Tunisienne de Banque");
        // First 2 + last 2 digits visible, middle masked.
        assertThat(r.getAccountNumberMasked()).startsWith("10 001 *");
        assertThat(r.getAccountNumberMasked()).endsWith(DEST_RIB.substring(18));
    }

    @Test
    void resolveUsername_stripsLeadingAtSign() {
        Client recipient = buildActiveRecipient("hamza.trabelsi", DEST_CIN, DEST_RIB,
                "Hamza", "Trabelsi", 50);
        when(userRepository.findByUsername("hamza.trabelsi")).thenReturn(Optional.of(recipient));
        when(cbsIntegrationService.getAccountByNumber(DEST_RIB))
                .thenReturn(new CbsAccountData(DEST_RIB, "STB", "STB", "CHECKING", BigDecimal.ZERO, DEST_CIN, null));
        when(bankRepository.findAll()).thenReturn(List.of(stb));

        UsernameResolveResponse r = assistService.resolveUsername(SENDER_ID, "@hamza.trabelsi");

        assertThat(r.getUsername()).isEqualTo("hamza.trabelsi");
    }

    @Test
    void resolveUsername_unknownUsername_throws404() {
        when(userRepository.findByUsername("ghost")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> assistService.resolveUsername(SENDER_ID, "ghost"))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("No PayZo user");
    }

    @Test
    void resolveUsername_selfTransfer_rejects() {
        // recipient's id == sender's id
        Client self = buildActiveRecipient("me.myself", SENDER_CIN, DEST_RIB, "Sara", "Mansouri", 90);
        self.setId(SENDER_ID);
        when(userRepository.findByUsername("me.myself")).thenReturn(Optional.of(self));

        assertThatThrownBy(() -> assistService.resolveUsername(SENDER_ID, "me.myself"))
                .isInstanceOf(ValidationException.class)
                .satisfies(e -> assertThat(((ValidationException) e).getErrorCode())
                        .isEqualTo("CANNOT_TRANSFER_TO_SELF"));
    }

    @Test
    void resolveUsername_noDefaultAccount_rejects() {
        Client recipient = buildActiveRecipient("hamza.trabelsi", DEST_CIN, null,
                "Hamza", "Trabelsi", 50);
        when(userRepository.findByUsername("hamza.trabelsi")).thenReturn(Optional.of(recipient));

        assertThatThrownBy(() -> assistService.resolveUsername(SENDER_ID, "hamza.trabelsi"))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> assertThat(((ConflictException) e).getErrorCode())
                        .isEqualTo("RECIPIENT_NO_DEFAULT_ACCOUNT"));
    }

    @Test
    void resolveUsername_inactiveBank_rejects() {
        stb.setActive(false);
        Client recipient = buildActiveRecipient("hamza.trabelsi", DEST_CIN, DEST_RIB,
                "Hamza", "Trabelsi", 50);
        when(userRepository.findByUsername("hamza.trabelsi")).thenReturn(Optional.of(recipient));
        when(cbsIntegrationService.getAccountByNumber(DEST_RIB))
                .thenReturn(new CbsAccountData(DEST_RIB, "STB", "STB", "CHECKING", BigDecimal.ZERO, DEST_CIN, null));
        when(bankRepository.findAll()).thenReturn(List.of(stb));

        assertThatThrownBy(() -> assistService.resolveUsername(SENDER_ID, "hamza.trabelsi"))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> assertThat(((ConflictException) e).getErrorCode()).isEqualTo("BANK_INACTIVE"));
    }

    @Test
    void resolveUsername_thirtyFirstAttemptIsRateLimited() {
        // All 30 lookups return 404 — that still consumes a rate-limit slot.
        when(userRepository.findByUsername("ghost")).thenReturn(Optional.empty());

        for (int i = 0; i < 30; i++) {
            try { assistService.resolveUsername(SENDER_ID, "ghost"); }
            catch (ResourceNotFoundException expected) { /* counts toward the limit */ }
        }

        assertThatThrownBy(() -> assistService.resolveUsername(SENDER_ID, "ghost"))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> assertThat(((ConflictException) e).getErrorCode())
                        .isEqualTo("RESOLVE_USERNAME_RATE_LIMIT"));
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static Client buildActiveRecipient(String username, String cin, String defaultAccountId,
                                                String firstName, String lastName, int trustScore) {
        Client c = new Client();
        c.setId(UUID.randomUUID());
        c.setUsername(username);
        c.setCin(cin);
        c.setStatus(UserStatus.ACTIVE);
        c.setFirstName(firstName);
        c.setLastName(lastName);
        c.setTrustScore(trustScore);
        c.setDefaultAccountId(defaultAccountId);
        return c;
    }

    private void stubResolveDeps() {
        when(clientRepository.findById(SENDER_ID)).thenReturn(Optional.of(sender));
        when(cbsIntegrationService.getAccountByNumber(DEST_RIB))
                .thenReturn(new CbsAccountData(DEST_RIB, "STB", "STB", "CHECKING", BigDecimal.ZERO, DEST_CIN, null));
        when(bankRepository.findAll()).thenReturn(List.of(stb));
        when(cbsIntegrationService.getClientByCin(DEST_CIN))
                .thenReturn(new CbsClientData("Hamza", "Trabelsi", "h@x.tn", "+216", "Tunis", null, null));
        when(clientRepository.findByCin(DEST_CIN)).thenReturn(Optional.empty());
    }

    private void stubVerifyDeps() {
        when(cbsIntegrationService.getAccountByNumber(DEST_RIB))
                .thenReturn(new CbsAccountData(DEST_RIB, "STB", "STB", "CHECKING", BigDecimal.ZERO, DEST_CIN, null));
        when(cbsIntegrationService.getClientByCin(DEST_CIN))
                .thenReturn(new CbsClientData("Hamza", "Trabelsi", "h@x.tn", "+216", "Tunis", null, null));
    }

    private static String generateRib(String numericBankCode, String branchCode, long accountSeq) {
        String first18 = numericBankCode + branchCode + String.format("%013d", accountSeq);
        int rem = new BigInteger(first18 + "00").mod(BigInteger.valueOf(97)).intValue();
        int key = (rem == 0) ? 0 : (97 - rem);
        return first18 + String.format("%02d", key);
    }
}
