package com.payzo.backend.service;

import com.payzo.backend.cbs.entity.AccountType;
import com.payzo.backend.cbs.entity.CbsAccount;
import com.payzo.backend.cbs.entity.CbsClient;
import com.payzo.backend.cbs.entity.CbsTransaction;
import com.payzo.backend.cbs.entity.TransactionType;
import com.payzo.backend.cbs.repository.CbsAccountRepository;
import com.payzo.backend.cbs.repository.CbsClientRepository;
import com.payzo.backend.cbs.repository.CbsTransactionRepository;
import com.payzo.backend.exception.CbsClientNotFoundException;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsAccountData;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsClientData;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsTransferResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * D2 — exercises the CBS-direct path. The repositories are mocked because the
 * Postgres datasource lives behind cbsEntityManagerFactory and can't be reached
 * without booting Spring (verification step 6 covers the full stack).
 */
@ExtendWith(MockitoExtension.class)
class CbsIntegrationServiceTest {

    @Mock private CbsClientRepository clientRepository;
    @Mock private CbsAccountRepository accountRepository;
    @Mock private CbsTransactionRepository transactionRepository;

    @InjectMocks
    private CbsIntegrationService service;

    private static final String CIN = "12345678";
    private static final String SRC = "100100100001";
    private static final String DST = "200200200002";
    private static final BigDecimal AMOUNT = new BigDecimal("500.00");
    private static final String REFERENCE = "TRX-9F2A18C0";

    @Test
    void getClientByCin_returnsMappedData_whenFound() {
        CbsClient c = client();
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(c));

        CbsClientData data = service.getClientByCin(CIN);

        assertThat(data.firstName()).isEqualTo("Sara");
        assertThat(data.lastName()).isEqualTo("Mansouri");
        assertThat(data.email()).isEqualTo("sara@payzo.tn");
        assertThat(data.governorate()).isEqualTo("Monastir");
    }

    @Test
    void getClientByCin_throws_whenMissing() {
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getClientByCin(CIN))
                .isInstanceOf(CbsClientNotFoundException.class)
                .hasMessageContaining(CIN);
    }

    @Test
    void getAccountsByClientCin_returnsMappedList() {
        CbsAccount a1 = account(SRC, new BigDecimal("3000.00"));
        CbsAccount a2 = account(DST, new BigDecimal("1500.00"));
        when(accountRepository.findByClientCin(CIN)).thenReturn(List.of(a1, a2));

        List<CbsAccountData> accounts = service.getAccountsByClientCin(CIN);

        assertThat(accounts).hasSize(2);
        assertThat(accounts.get(0).accountNumber()).isEqualTo(SRC);
        assertThat(accounts.get(0).clientCin()).isEqualTo(CIN);
        assertThat(accounts.get(1).balance()).isEqualByComparingTo("1500.00");
    }

    @Test
    void getAccountByNumber_returnsMappedData_whenFound() {
        when(accountRepository.findByAccountNumber(SRC))
                .thenReturn(Optional.of(account(SRC, new BigDecimal("3000.00"))));

        CbsAccountData data = service.getAccountByNumber(SRC);

        assertThat(data.accountNumber()).isEqualTo(SRC);
        assertThat(data.bankCode()).isEqualTo("ATB");
        assertThat(data.type()).isEqualTo("CHECKING");
        assertThat(data.balance()).isEqualByComparingTo("3000.00");
    }

    @Test
    void getAccountByNumber_throws_whenMissing() {
        when(accountRepository.findByAccountNumber(SRC)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getAccountByNumber(SRC))
                .isInstanceOf(CbsClientNotFoundException.class)
                .hasMessageContaining(SRC);
    }

    @Test
    void executeTransfer_movesMoneyAndWritesDebitCreditPairWithReference() {
        CbsAccount source = account(SRC, new BigDecimal("3000.00"));
        CbsAccount dest = account(DST, new BigDecimal("1500.00"));
        when(accountRepository.findByAccountNumber(SRC)).thenReturn(Optional.of(source));
        when(accountRepository.findByAccountNumber(DST)).thenReturn(Optional.of(dest));

        CbsTransferResult result = service.executeTransfer(SRC, DST, AMOUNT, REFERENCE);

        assertThat(result.success()).isTrue();
        assertThat(result.newSourceBalance()).isEqualByComparingTo("2500.00");
        assertThat(result.newDestBalance()).isEqualByComparingTo("2000.00");
        assertThat(source.getBalance()).isEqualByComparingTo("2500.00");
        assertThat(dest.getBalance()).isEqualByComparingTo("2000.00");

        ArgumentCaptor<CbsTransaction> txCaptor = ArgumentCaptor.forClass(CbsTransaction.class);
        verify(transactionRepository, times(2)).save(txCaptor.capture());
        List<CbsTransaction> rows = txCaptor.getAllValues();

        CbsTransaction debit = rows.stream().filter(r -> r.getType() == TransactionType.DEBIT).findFirst().orElseThrow();
        CbsTransaction credit = rows.stream().filter(r -> r.getType() == TransactionType.CREDIT).findFirst().orElseThrow();

        assertThat(debit.getAccount()).isSameAs(source);
        assertThat(debit.getReferenceByPayZo()).isEqualTo(REFERENCE);
        assertThat(debit.getClientCin()).isEqualTo(CIN);
        assertThat(debit.getCounterpartAccount()).isEqualTo(DST);

        assertThat(credit.getAccount()).isSameAs(dest);
        assertThat(credit.getReferenceByPayZo()).isEqualTo(REFERENCE);
        assertThat(credit.getClientCin()).isEqualTo(CIN);
        assertThat(credit.getCounterpartAccount()).isEqualTo(SRC);
    }

    @Test
    void executeTransfer_throwsConflict_whenInsufficientBalance() {
        CbsAccount source = account(SRC, new BigDecimal("100.00"));
        CbsAccount dest = account(DST, new BigDecimal("1500.00"));
        when(accountRepository.findByAccountNumber(SRC)).thenReturn(Optional.of(source));
        when(accountRepository.findByAccountNumber(DST)).thenReturn(Optional.of(dest));

        assertThatThrownBy(() -> service.executeTransfer(SRC, DST, AMOUNT, REFERENCE))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("Insufficient");

        verify(accountRepository, never()).save(any());
        verify(transactionRepository, never()).save(any());
    }

    @Test
    void executeTransfer_throws_whenSourceMissing() {
        when(accountRepository.findByAccountNumber(SRC)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.executeTransfer(SRC, DST, AMOUNT, REFERENCE))
                .isInstanceOf(CbsClientNotFoundException.class)
                .hasMessageContaining(SRC);
    }

    private CbsClient client() {
        return CbsClient.builder()
                .cin(CIN)
                .firstName("Sara")
                .lastName("Mansouri")
                .email("sara@payzo.tn")
                .phone("+21622145678")
                .governorate("Monastir")
                .address("Avenue Habib Bourguiba")
                .dateOfBirth(LocalDate.of(1992, 8, 23))
                .build();
    }

    private CbsAccount account(String number, BigDecimal balance) {
        return CbsAccount.builder()
                .accountNumber(number)
                .client(client())
                .bankCode("ATB")
                .type(AccountType.CHECKING)
                .balance(balance)
                .openedAt(LocalDate.of(2021, 3, 14))
                .build();
    }
}
