package com.payzo.cbs.controller;

import com.payzo.cbs.dto.AccountResponse;
import com.payzo.cbs.dto.BankResponse;
import com.payzo.cbs.dto.CbsApiResponse;
import com.payzo.cbs.dto.ClientResponse;
import com.payzo.cbs.dto.PagedResponse;
import com.payzo.cbs.dto.TransactionResponse;
import com.payzo.cbs.dto.TransferRequest;
import com.payzo.cbs.model.CbsAccount;
import com.payzo.cbs.model.CbsClient;
import com.payzo.cbs.model.CbsTransaction;
import com.payzo.cbs.repository.CbsBankRepository;
import com.payzo.cbs.service.CbsClientService;
import com.payzo.cbs.service.CbsTransferService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Open REST surface for the simulator, no Spring Security by design. Only
 * reachable inside the docker network (the cbs-simulator port is not exposed
 * outside the compose stack). Provides health, client + account lookups,
 * paginated transaction history (size clamped to 100), and the transfer
 * endpoint that payzo-backend hits when running against the simulator in
 * REST mode rather than direct JPA.
 */
@RestController
@RequestMapping("/cbs/api/v1")
@RequiredArgsConstructor
public class CbsController {

    private final CbsClientService clientService;
    private final CbsTransferService transferService;
    private final CbsBankRepository bankRepository;

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        return ResponseEntity.ok(Map.of("status", "UP", "service", "cbs-simulator"));
    }

    @GetMapping("/banks")
    public ResponseEntity<CbsApiResponse<List<BankResponse>>> getBanks() {
        List<BankResponse> banks = bankRepository.findAll().stream()
                .map(b -> new BankResponse(b.getCode(), b.getNumericCode(), b.getName()))
                .toList();
        return ResponseEntity.ok(CbsApiResponse.ok(banks));
    }

    @GetMapping("/clients/{cin}")
    public ResponseEntity<CbsApiResponse<ClientResponse>> getClient(@PathVariable String cin) {
        CbsClient client = clientService.findByCin(cin);
        ClientResponse data = new ClientResponse(
                client.getCin(), client.getFirstName(), client.getLastName(),
                client.getEmail(), client.getPhone(), client.getDateOfBirth(),
                client.getAddress(), client.getGovernorate()
        );
        return ResponseEntity.ok(CbsApiResponse.ok(data));
    }

    @GetMapping("/clients/{cin}/accounts")
    public ResponseEntity<CbsApiResponse<List<AccountResponse>>> getClientAccounts(@PathVariable String cin) {
        List<CbsAccount> accounts = clientService.getAccountsByClientCin(cin);
        List<AccountResponse> accountList = accounts.stream().map(this::toAccountResponse).toList();
        return ResponseEntity.ok(CbsApiResponse.ok(accountList));
    }

    @GetMapping("/accounts/{accountNum}")
    public ResponseEntity<CbsApiResponse<AccountResponse>> getAccount(@PathVariable String accountNum) {
        CbsAccount account = clientService.getAccountByNumber(accountNum);
        return ResponseEntity.ok(CbsApiResponse.ok(toAccountResponse(account)));
    }

    @GetMapping("/accounts/{accountNum}/transactions")
    public ResponseEntity<PagedResponse<TransactionResponse>> getAccountTransactions(
            @PathVariable String accountNum,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        int clampedSize = Math.min(size, 100);
        Page<CbsTransaction> txPage = clientService.getTransactionsByAccountNumber(accountNum, PageRequest.of(page, clampedSize));

        List<TransactionResponse> txList = txPage.getContent().stream().map(tx ->
                new TransactionResponse(
                        tx.getId(),
                        tx.getAccount().getAccountNumber(),
                        tx.getType().name(),
                        tx.getAmount(),
                        tx.getCounterpartAccount(),
                        tx.getDescription(),
                        tx.getTimestamp()
                )
        ).toList();

        return ResponseEntity.ok(new PagedResponse<>(
                true, txList, txPage.getNumber(), txPage.getSize(),
                txPage.getTotalElements(), txPage.getTotalPages()
        ));
    }

    @PutMapping("/accounts/transfer")
    public ResponseEntity<CbsApiResponse<Void>> transfer(@Valid @RequestBody TransferRequest request) {
        transferService.executeTransfer(request.sourceAccount(), request.destAccount(), request.amount());
        return ResponseEntity.ok(CbsApiResponse.ok("Transfer executed successfully"));
    }

    private AccountResponse toAccountResponse(CbsAccount account) {
        return new AccountResponse(
                account.getAccountNumber(),
                account.getClient().getCin(),
                account.getBankCode(),
                account.getType().name(),
                account.getBalance(),
                account.getOpenedAt()
        );
    }
}
