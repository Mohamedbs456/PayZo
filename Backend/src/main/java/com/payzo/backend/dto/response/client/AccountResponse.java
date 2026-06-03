package com.payzo.backend.dto.response.client;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class AccountResponse {

    private String accountNumber;
    private String bankCode;
    private String bankName;
    private String type;
    private BigDecimal balance;
    private boolean bankActive;
}
