package com.payzo.cbs.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public record TransactionResponse(UUID id, String accountNumber, String type,
                                   BigDecimal amount, String counterpartAccount,
                                   String description, OffsetDateTime timestamp) {}
