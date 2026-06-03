package com.payzo.backend.mapper;

import com.payzo.backend.domain.entity.Transaction;
import com.payzo.backend.dto.response.client.TransactionResponse;
import org.mapstruct.Mapper;

@Mapper
public interface TransactionMapper {

    TransactionResponse toTransactionResponse(Transaction transaction);
}
