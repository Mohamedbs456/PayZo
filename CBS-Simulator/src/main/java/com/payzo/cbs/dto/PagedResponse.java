package com.payzo.cbs.dto;

import java.util.List;

public record PagedResponse<T>(boolean success, List<T> data, int page, int size,
                                long totalElements, int totalPages) {}
