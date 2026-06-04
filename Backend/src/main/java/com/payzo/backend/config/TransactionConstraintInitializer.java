package com.payzo.backend.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

/**
 * Ensures the partial unique index that enforces "at most one in-progress transfer
 * per client" exists regardless of ddl-auto profile. import.sql only runs under
 * ddl-auto=create, so both dev (update) and prod (validate) would otherwise leave
 * the transactions table without this guard.
 */
@Component
@Slf4j
public class TransactionConstraintInitializer {

    private final JdbcTemplate jdbc;

    public TransactionConstraintInitializer(@Qualifier("dataSource") DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @EventListener(ApplicationReadyEvent.class)
    public void createTransactionConstraints() {
        try {
            jdbc.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS uk_tx_client_in_progress " +
                "ON transactions (client_id) " +
                "WHERE status IN ('PENDING_OTP', 'PENDING_SCORING')"
            );
            log.info("Transaction race-guard index verified");
        } catch (Exception e) {
            log.warn("Could not create uk_tx_client_in_progress index: {}", e.getMessage());
        }
    }
}
