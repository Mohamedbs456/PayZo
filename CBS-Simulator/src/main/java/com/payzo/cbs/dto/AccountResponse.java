package com.payzo.cbs.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record AccountResponse(String accountNumber, String clientCin, String bankCode,
                               String type, BigDecimal balance, LocalDate openedAt) {}
