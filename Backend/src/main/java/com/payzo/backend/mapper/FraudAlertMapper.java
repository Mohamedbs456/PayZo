package com.payzo.backend.mapper;

import com.payzo.backend.domain.entity.FraudAlert;
import com.payzo.backend.dto.response.analyst.FraudAlertResponse;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper
public interface FraudAlertMapper {

    @Mapping(source = "transaction.id",         target = "transactionId")
    @Mapping(source = "transaction.reference",  target = "transactionReference")
    @Mapping(source = "transaction.amount",     target = "amount")
    @Mapping(source = "transaction.riskScore",  target = "riskScore")
    @Mapping(source = "transaction.riskLevel",  target = "riskLevel")
    @Mapping(source = "transaction.sourceBankCode", target = "sourceBankCode")
    @Mapping(source = "transaction.destBankCode",   target = "destBankCode")
    @Mapping(source = "transaction.client.cin", target = "clientCin")
    @Mapping(target  = "clientName",
             expression = "java(fraudAlert.getTransaction().getClient().getFirstName() + \" \" + fraudAlert.getTransaction().getClient().getLastName())")
    @Mapping(source = "analyst.id",   target = "analystId")
    @Mapping(target = "analystName",
             expression = "java(fraudAlert.getAnalyst() == null ? null : fraudAlert.getAnalyst().getFirstName() + \" \" + fraudAlert.getAnalyst().getLastName())")
    @Mapping(source = "analyst.role", target = "analystRole")
    FraudAlertResponse toFraudAlertResponse(FraudAlert fraudAlert);
}
