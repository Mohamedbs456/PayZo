package com.payzo.cbs.dto;

import lombok.Builder;

@Builder
public record CbsApiResponse<T>(boolean success, String message, T data) {
    public static <T> CbsApiResponse<T> ok(T data) {
        return new CbsApiResponse<>(true, null, data);
    }
    public static <T> CbsApiResponse<T> ok(String message) {
        return new CbsApiResponse<>(true, message, null);
    }
}
