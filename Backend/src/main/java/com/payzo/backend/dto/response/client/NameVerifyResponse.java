package com.payzo.backend.dto.response.client;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class NameVerifyResponse {

    private boolean matched;
    private int attemptsRemaining;
}
