package com.payzo.cbs.repository;

import com.payzo.cbs.model.CbsAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CbsAccountRepository extends JpaRepository<CbsAccount, String> {

    List<CbsAccount> findByClientCin(String cin);
}
