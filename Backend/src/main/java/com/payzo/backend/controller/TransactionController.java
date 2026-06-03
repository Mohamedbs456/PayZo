package com.payzo.backend.controller;

import com.payzo.backend.domain.enums.AmountBand;
import com.payzo.backend.domain.enums.RiskLevel;
import com.payzo.backend.domain.enums.TransactionStatus;
import com.payzo.backend.dto.response.admin.TransactionDetailResponse;
import com.payzo.backend.dto.response.admin.TransactionListItemResponse;
import com.payzo.backend.dto.response.common.ApiResponse;
import com.payzo.backend.dto.response.common.PagedResponse;
import com.payzo.backend.service.admin.TransactionService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Backoffice-facing transactions API. Scope per Impact 9 / Impact 25 / D40 / D41:
 *
 *   GET /api/v1/transactions              — paged list with filters
 *   GET /api/v1/transactions/{id}         — full detail by id
 *   GET /api/v1/transactions?ref=TRX-XXX  — deep link from a fraud alert
 *
 * Locked to ADMIN/ANALYST/SUPERADMIN by SecurityConfig. Clients still use the
 * existing /api/v1/client/transfers/{id} endpoint for their own transfer detail.
 */
@RestController
@RequestMapping("/api/v1/transactions")
@RequiredArgsConstructor
public class TransactionController {

    private final TransactionService transactionService;

    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<TransactionListItemResponse>>> list(
            @RequestParam(required = false) TransactionStatus status,
            @RequestParam(required = false) RiskLevel risk,
            @RequestParam(required = false) String bankCode,
            @RequestParam(required = false) AmountBand amount,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String ref,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<TransactionListItemResponse> result = transactionService.list(
                status, risk, bankCode, amount, period, ref, q, clamp(page, size));
        return ResponseEntity.ok(ApiResponse.success("OK", toPagedResponse(result)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<TransactionDetailResponse>> detail(@PathVariable UUID id) {
        TransactionDetailResponse detail = transactionService.getDetail(id);
        return ResponseEntity.ok(ApiResponse.success("OK", detail));
    }

    private Pageable clamp(int page, int size) {
        return PageRequest.of(page,
                Math.min(Math.max(size, 1), 100),
                Sort.by(Sort.Direction.DESC, "createdAt"));
    }

    private <T> PagedResponse<T> toPagedResponse(Page<T> page) {
        return PagedResponse.<T>builder()
                .content(page.getContent())
                .page(page.getNumber())
                .size(page.getSize())
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .build();
    }
}
