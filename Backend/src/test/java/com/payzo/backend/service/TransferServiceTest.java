package com.payzo.backend.service;

import com.payzo.backend.domain.entity.*;
import com.payzo.backend.domain.enums.*;
import com.payzo.backend.dto.client.ClientProfile;
import com.payzo.backend.dto.request.client.TransferRequest;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.exception.ValidationException;
import com.payzo.backend.repository.*;
import com.payzo.backend.service.audit.AuditService;
import com.payzo.backend.service.auth.OtpService;
import com.payzo.backend.service.client.BeneficiaryService;
import com.payzo.backend.service.client.ClientProfileService;
import com.payzo.backend.service.client.TransferService;
import com.payzo.backend.service.client.TrustScoreService;
import com.payzo.backend.service.fraud.FraudDetectionService;
import com.payzo.backend.service.fraud.FraudDetectionService.ScoringResult;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsAccountData;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsClientData;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsTransferResult;
import com.payzo.backend.service.notification.InAppNotificationService;
import com.payzo.backend.service.notification.NotificationService;
import com.payzo.backend.util.TransactionReferenceGenerator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Covers the new RIB-based transfer pipeline: initiate validation paths
 * (RIB, name match, self-transfer, bank-active, in-progress lock) and the
 * post-APPROVED dispatch (PayZo vs non-PayZo receiver, beneficiary upsert).
 */
@ExtendWith(MockitoExtension.class)
class TransferServiceTest {

    @Mock private TransactionRepository transactionRepository;
    @Mock private ClientRepository clientRepository;
    @Mock private BankRepository bankRepository;
    @Mock private BeneficiaryRepository beneficiaryRepository;
    @Mock private BeneficiaryService beneficiaryService;
    @Mock private FraudAlertRepository fraudAlertRepository;
    @Mock private UserRepository userRepository;
    @Mock private CbsIntegrationService cbsIntegrationService;
    @Mock private FraudDetectionService fraudDetectionService;
    @Mock private OtpService otpService;
    @Mock private NotificationService notificationService;
    @Mock private InAppNotificationService inAppNotificationService;
    @Mock private AuditService auditService;
    @Mock private TransactionReferenceGenerator referenceGenerator;
    @Mock private TrustScoreService trustScoreService;
    @Mock private ClientProfileService clientProfileService;

    @InjectMocks
    private TransferService transferService;

    private static final UUID CLIENT_ID = UUID.randomUUID();
    private static final String SENDER_CIN = "12345678";
    private static final String DEST_CIN = "87654321";
    private static final String SOURCE_RIB = generateRib("10", "001", 1L);
    private static final String DEST_RIB = generateRib("10", "001", 2L);
    private static final BigDecimal AMOUNT = new BigDecimal("500.00");

    private static final ClientProfile STUB_PROFILE = new ClientProfile(
            UUID.randomUUID(), null, SENDER_CIN, "user", "Sara", "Mansouri",
            null, 50, null, null, false,
            "sara@payzo.tn", "+21622145678", null, null, null);

    private Client sender;
    private Bank stbBank;
    private CbsAccountData srcAccount;
    private CbsAccountData destAccount;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(transferService, "clientSignupUrl", "http://localhost:5173/signup");

        sender = new Client();
        sender.setId(CLIENT_ID);
        sender.setCin(SENDER_CIN);
        sender.setStatus(UserStatus.ACTIVE);
        sender.setFirstName("Sara");
        sender.setLastName("Mansouri");
        sender.setEmail("sara@payzo.tn");

        stbBank = new Bank();
        stbBank.setId(UUID.randomUUID());
        stbBank.setCode("STB");
        stbBank.setNumericCode("10");
        stbBank.setName("Société Tunisienne de Banque");
        stbBank.setActive(true);

        srcAccount = new CbsAccountData(SOURCE_RIB, "STB", "STB", "CHECKING",
                new BigDecimal("2000.00"), SENDER_CIN, null);
        destAccount = new CbsAccountData(DEST_RIB, "STB", "STB", "CHECKING",
                new BigDecimal("1000.00"), DEST_CIN, null);

        lenient().when(clientProfileService.forClient(any())).thenReturn(STUB_PROFILE);
    }

    // ── initiate validation ──────────────────────────────────────────────────

    @Test
    void initiate_happyPath_persistsPendingOtpAndDispatchesOtp() {
        stubInitiateHappyPath();

        UUID txId = transferService.initiateTransfer(CLIENT_ID, manualReq("Hamza", "Trabelsi", null, null));

        ArgumentCaptor<Transaction> captor = ArgumentCaptor.forClass(Transaction.class);
        verify(transactionRepository).saveAndFlush(captor.capture());
        Transaction saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(TransactionStatus.PENDING_OTP);
        assertThat(saved.getDestinationAccountNumber()).isEqualTo(DEST_RIB);
        assertThat(saved.getDestClientCin()).isEqualTo(DEST_CIN);
        verify(otpService).generate(eq(SENDER_CIN), eq(OtpPurpose.TRANSFER_CONFIRMATION), any(), any());
    }

    @Test
    void initiate_rejectsInvalidRib() {
        TransferRequest req = manualReq("Hamza", "Trabelsi", null, null);
        req.setDestRib("not-a-rib");

        assertThatThrownBy(() -> transferService.initiateTransfer(CLIENT_ID, req))
                .isInstanceOf(ValidationException.class)
                .satisfies(e -> assertThat(((ValidationException) e).getErrorCode()).isEqualTo("INVALID_RIB"));
        verify(transactionRepository, never()).saveAndFlush(any());
    }

    @Test
    void initiate_rejectsSelfTransfer() {
        TransferRequest req = manualReq("Hamza", "Trabelsi", null, null);
        req.setDestRib(SOURCE_RIB);  // same as source

        assertThatThrownBy(() -> transferService.initiateTransfer(CLIENT_ID, req))
                .isInstanceOf(ValidationException.class)
                .satisfies(e -> assertThat(((ValidationException) e).getErrorCode()).isEqualTo("CANNOT_TRANSFER_TO_SELF"));
    }

    @Test
    void initiate_rejectsNameMismatch() {
        when(transactionRepository.existsByClientIdAndStatusIn(any(), anyList())).thenReturn(false);
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.of(sender));
        when(cbsIntegrationService.getAccountByNumber(SOURCE_RIB)).thenReturn(srcAccount);
        when(bankRepository.findByCode("STB")).thenReturn(Optional.of(stbBank));
        when(cbsIntegrationService.getAccountByNumber(DEST_RIB)).thenReturn(destAccount);
        when(bankRepository.findAll()).thenReturn(List.of(stbBank));
        when(cbsIntegrationService.getClientByCin(DEST_CIN))
                .thenReturn(new CbsClientData("Hamza", "Trabelsi", "h@x.tn", "+216", "Tunis", null, null));

        TransferRequest req = manualReq("Karim", "Mejri", null, null); // wrong names

        assertThatThrownBy(() -> transferService.initiateTransfer(CLIENT_ID, req))
                .isInstanceOf(ValidationException.class)
                .satisfies(e -> assertThat(((ValidationException) e).getErrorCode()).isEqualTo("NAME_MISMATCH"));
        verify(transactionRepository, never()).saveAndFlush(any());
    }

    @Test
    void initiate_rejectsInactiveDestBank() {
        stbBank.setActive(false);
        when(transactionRepository.existsByClientIdAndStatusIn(any(), anyList())).thenReturn(false);
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.of(sender));
        when(cbsIntegrationService.getAccountByNumber(SOURCE_RIB)).thenReturn(srcAccount);
        // source bank lookup uses findByCode; we still need it active for source check.
        // Fake an active source bank distinct from the inactive dest match.
        Bank activeSource = new Bank();
        activeSource.setId(UUID.randomUUID());
        activeSource.setCode("STB");
        activeSource.setNumericCode("10");
        activeSource.setName("STB");
        activeSource.setActive(true);
        when(bankRepository.findByCode("STB")).thenReturn(Optional.of(activeSource));
        when(cbsIntegrationService.getAccountByNumber(DEST_RIB)).thenReturn(destAccount);
        when(bankRepository.findAll()).thenReturn(List.of(stbBank));

        TransferRequest req = manualReq("Hamza", "Trabelsi", null, null);

        assertThatThrownBy(() -> transferService.initiateTransfer(CLIENT_ID, req))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> assertThat(((ConflictException) e).getErrorCode()).isEqualTo("BANK_INACTIVE"));
    }

    @Test
    void initiate_rejectsConcurrentInProgressTransfer() {
        when(transactionRepository.existsByClientIdAndStatusIn(any(), anyList())).thenReturn(true);

        assertThatThrownBy(() -> transferService.initiateTransfer(CLIENT_ID, manualReq("Hamza", "Trabelsi", null, null)))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> assertThat(((ConflictException) e).getErrorCode()).isEqualTo("TRANSFER_ALREADY_IN_PROGRESS"));
    }

    // ── username-mode initiate (D53) ─────────────────────────────────────────

    @Test
    void initiate_byUsername_resolvesToDefaultAccount() {
        String username = "hamza.trabelsi";
        Client recipient = new Client();
        recipient.setId(UUID.randomUUID());
        recipient.setUsername(username);
        recipient.setCin(DEST_CIN);
        recipient.setStatus(UserStatus.ACTIVE);
        recipient.setFirstName("Hamza");
        recipient.setLastName("Trabelsi");
        recipient.setDefaultAccountId(DEST_RIB);

        when(userRepository.findByUsername(username)).thenReturn(Optional.of(recipient));
        when(transactionRepository.existsByClientIdAndStatusIn(any(), anyList())).thenReturn(false);
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.of(sender));
        when(cbsIntegrationService.getAccountByNumber(SOURCE_RIB)).thenReturn(srcAccount);
        when(bankRepository.findByCode("STB")).thenReturn(Optional.of(stbBank));
        when(cbsIntegrationService.getAccountByNumber(DEST_RIB)).thenReturn(destAccount);
        when(bankRepository.findAll()).thenReturn(List.of(stbBank));
        when(referenceGenerator.generate()).thenReturn("TRX-USER");
        when(transactionRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        UUID txId = transferService.initiateTransfer(CLIENT_ID, usernameReq(username));

        ArgumentCaptor<Transaction> captor = ArgumentCaptor.forClass(Transaction.class);
        verify(transactionRepository).saveAndFlush(captor.capture());
        Transaction saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(TransactionStatus.PENDING_OTP);
        assertThat(saved.getDestinationAccountNumber()).isEqualTo(DEST_RIB);
        assertThat(saved.getDestClientCin()).isEqualTo(DEST_CIN);
        // Name re-verification must be skipped on the username path — getClientByCin
        // would only be called by step 6 if !trustsName.
        verify(cbsIntegrationService, never()).getClientByCin(DEST_CIN);
    }

    @Test
    void initiate_byUsername_stripsLeadingAtSign() {
        String username = "hamza.trabelsi";
        Client recipient = new Client();
        recipient.setId(UUID.randomUUID());
        recipient.setUsername(username);
        recipient.setCin(DEST_CIN);
        recipient.setStatus(UserStatus.ACTIVE);
        recipient.setFirstName("Hamza");
        recipient.setLastName("Trabelsi");
        recipient.setDefaultAccountId(DEST_RIB);

        when(userRepository.findByUsername(username)).thenReturn(Optional.of(recipient));
        when(transactionRepository.existsByClientIdAndStatusIn(any(), anyList())).thenReturn(false);
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.of(sender));
        when(cbsIntegrationService.getAccountByNumber(SOURCE_RIB)).thenReturn(srcAccount);
        when(bankRepository.findByCode("STB")).thenReturn(Optional.of(stbBank));
        when(cbsIntegrationService.getAccountByNumber(DEST_RIB)).thenReturn(destAccount);
        when(bankRepository.findAll()).thenReturn(List.of(stbBank));
        when(referenceGenerator.generate()).thenReturn("TRX-AT");
        when(transactionRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        // Leading @ is tolerated — backend normalises it away.
        transferService.initiateTransfer(CLIENT_ID, usernameReq("@" + username));

        verify(userRepository).findByUsername(username);  // no @ in the actual lookup
    }

    @Test
    void initiate_byUsername_rejectsSelf() {
        String username = "me.myself";
        Client self = new Client();
        self.setId(CLIENT_ID);                     // same id as sender
        self.setUsername(username);
        self.setStatus(UserStatus.ACTIVE);
        self.setDefaultAccountId(DEST_RIB);
        when(userRepository.findByUsername(username)).thenReturn(Optional.of(self));

        assertThatThrownBy(() -> transferService.initiateTransfer(CLIENT_ID, usernameReq(username)))
                .isInstanceOf(ValidationException.class)
                .satisfies(e -> assertThat(((ValidationException) e).getErrorCode())
                        .isEqualTo("CANNOT_TRANSFER_TO_SELF"));
        verify(transactionRepository, never()).saveAndFlush(any());
    }

    @Test
    void initiate_byUsername_rejectsNoDefaultAccount() {
        String username = "hamza.trabelsi";
        Client recipient = new Client();
        recipient.setId(UUID.randomUUID());
        recipient.setUsername(username);
        recipient.setStatus(UserStatus.ACTIVE);
        recipient.setDefaultAccountId(null);
        when(userRepository.findByUsername(username)).thenReturn(Optional.of(recipient));

        assertThatThrownBy(() -> transferService.initiateTransfer(CLIENT_ID, usernameReq(username)))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> assertThat(((ConflictException) e).getErrorCode())
                        .isEqualTo("RECIPIENT_NO_DEFAULT_ACCOUNT"));
        verify(transactionRepository, never()).saveAndFlush(any());
    }

    // ── post-APPROVED receiver dispatch ──────────────────────────────────────

    @Test
    void confirmTransfer_lowRisk_payzoReceiver_firesInAppAndEmail() {
        Transaction tx = pendingOtpTransaction();
        when(transactionRepository.findById(tx.getId())).thenReturn(Optional.of(tx));
        when(fraudDetectionService.score(tx))
                .thenReturn(new ScoringResult(new BigDecimal("0.10"), RiskLevel.LOW, "test-v1", List.of()));
        when(cbsIntegrationService.executeTransfer(any(), any(), any(), any()))
                .thenReturn(new CbsTransferResult(true, BigDecimal.ZERO, BigDecimal.ZERO));

        // PayZo receiver exists for DEST_CIN.
        Client receiver = new Client();
        receiver.setId(UUID.randomUUID());
        receiver.setCin(DEST_CIN);
        receiver.setEmail("hamza@payzo.tn");
        when(clientRepository.findByCin(DEST_CIN)).thenReturn(Optional.of(receiver));
        when(cbsIntegrationService.getClientByCin(DEST_CIN))
                .thenReturn(new CbsClientData("Hamza", "Trabelsi", "hamza@payzo.tn", "+216", "Tunis", null, null));

        transferService.confirmTransfer(tx.getId(), "123456", CLIENT_ID);

        verify(inAppNotificationService).create(
                eq(receiver.getId()), anyString(), anyString(),
                eq(UserNotificationType.TRX_RECEIVED));
        ArgumentCaptor<Map> vars = ArgumentCaptor.forClass(Map.class);
        verify(notificationService).send(eq("TRANSFER_RECEIVED"), anyString(), any(), vars.capture());
        assertThat(vars.getValue()).containsEntry("joinCta", false);
    }

    @Test
    void confirmTransfer_lowRisk_nonPayZoReceiver_emailOnlyWithCta() {
        Transaction tx = pendingOtpTransaction();
        when(transactionRepository.findById(tx.getId())).thenReturn(Optional.of(tx));
        when(fraudDetectionService.score(tx))
                .thenReturn(new ScoringResult(new BigDecimal("0.10"), RiskLevel.LOW, "test-v1", List.of()));
        when(cbsIntegrationService.executeTransfer(any(), any(), any(), any()))
                .thenReturn(new CbsTransferResult(true, BigDecimal.ZERO, BigDecimal.ZERO));

        // No PayZo client matches DEST_CIN.
        when(clientRepository.findByCin(DEST_CIN)).thenReturn(Optional.empty());
        when(cbsIntegrationService.getClientByCin(DEST_CIN))
                .thenReturn(new CbsClientData("Hamza", "Trabelsi", "guest@x.tn", "+216", "Tunis", null, null));

        transferService.confirmTransfer(tx.getId(), "123456", CLIENT_ID);

        // No in-app notification for the receiver since they have no PayZo user row.
        verify(inAppNotificationService, never()).create(
                any(), anyString(), anyString(), eq(UserNotificationType.TRX_RECEIVED));
        ArgumentCaptor<Map> vars = ArgumentCaptor.forClass(Map.class);
        verify(notificationService).send(eq("TRANSFER_RECEIVED"), eq("guest@x.tn"), isNull(), vars.capture());
        assertThat(vars.getValue())
                .containsEntry("joinCta", true)
                .containsKey("signupUrl");
    }

    @Test
    void confirmTransfer_postApprovedFailureDoesNotRollback() {
        Transaction tx = pendingOtpTransaction();
        when(transactionRepository.findById(tx.getId())).thenReturn(Optional.of(tx));
        when(fraudDetectionService.score(tx))
                .thenReturn(new ScoringResult(new BigDecimal("0.10"), RiskLevel.LOW, "test-v1", List.of()));
        when(cbsIntegrationService.executeTransfer(any(), any(), any(), any()))
                .thenReturn(new CbsTransferResult(true, BigDecimal.ZERO, BigDecimal.ZERO));
        when(clientRepository.findByCin(DEST_CIN)).thenReturn(Optional.empty());
        when(cbsIntegrationService.getClientByCin(DEST_CIN))
                .thenThrow(new RuntimeException("CBS hiccup"));

        // Must NOT bubble up — split-brain prevention, CBS already committed.
        assertThatCode(() -> transferService.confirmTransfer(tx.getId(), "123456", CLIENT_ID))
                .doesNotThrowAnyException();
        // The PayZo transaction row should still flip to APPROVED.
        assertThat(tx.getStatus()).isEqualTo(TransactionStatus.APPROVED);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private void stubInitiateHappyPath() {
        when(transactionRepository.existsByClientIdAndStatusIn(any(), anyList())).thenReturn(false);
        when(clientRepository.findById(CLIENT_ID)).thenReturn(Optional.of(sender));
        when(cbsIntegrationService.getAccountByNumber(SOURCE_RIB)).thenReturn(srcAccount);
        when(bankRepository.findByCode("STB")).thenReturn(Optional.of(stbBank));
        when(cbsIntegrationService.getAccountByNumber(DEST_RIB)).thenReturn(destAccount);
        when(bankRepository.findAll()).thenReturn(List.of(stbBank));
        when(cbsIntegrationService.getClientByCin(DEST_CIN))
                .thenReturn(new CbsClientData("Hamza", "Trabelsi", "h@x.tn", "+216", "Tunis", null, null));
        when(referenceGenerator.generate()).thenReturn("TRX-TEST");
        when(transactionRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private TransferRequest usernameReq(String username) {
        TransferRequest r = new TransferRequest();
        r.setSourceAccountNumber(SOURCE_RIB);
        r.setPayzoUsername(username);
        r.setAmount(AMOUNT);
        return r;
    }

    private TransferRequest manualReq(String firstName, String lastName, Boolean save, String nickname) {
        TransferRequest r = new TransferRequest();
        r.setSourceAccountNumber(SOURCE_RIB);
        r.setDestRib(DEST_RIB);
        r.setDestFirstName(firstName);
        r.setDestLastName(lastName);
        r.setSaveBeneficiary(save);
        r.setBeneficiaryNickname(nickname);
        r.setAmount(AMOUNT);
        r.setMotif("test");
        return r;
    }

    private Transaction pendingOtpTransaction() {
        Transaction tx = new Transaction();
        tx.setId(UUID.randomUUID());
        tx.setReference("TRX-TEST");
        tx.setClient(sender);
        tx.setSourceAccountNumber(SOURCE_RIB);
        tx.setDestinationAccountNumber(DEST_RIB);
        tx.setSourceBankCode("STB");
        tx.setDestBankCode("STB");
        tx.setDestClientCin(DEST_CIN);
        tx.setAmount(AMOUNT);
        tx.setStatus(TransactionStatus.PENDING_OTP);
        return tx;
    }

    private static String generateRib(String numericBankCode, String branchCode, long accountSeq) {
        String first18 = numericBankCode + branchCode + String.format("%013d", accountSeq);
        int rem = new BigInteger(first18 + "00").mod(BigInteger.valueOf(97)).intValue();
        int key = (rem == 0) ? 0 : (97 - rem);
        return first18 + String.format("%02d", key);
    }
}
