package com.payzo.backend.mapper;

import com.payzo.backend.domain.entity.Bank;
import com.payzo.backend.dto.response.superadmin.BankResponse;
import org.mapstruct.Mapper;

@Mapper
public interface BankMapper {

    BankResponse toBankResponse(Bank bank);
}
