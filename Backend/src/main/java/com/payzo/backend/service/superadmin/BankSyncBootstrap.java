package com.payzo.backend.service.superadmin;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Drives {@link BankSyncService#syncFromCbs()} on startup and at 5-minute
 * intervals until the first successful run completes. Listening to
 * {@link ApplicationReadyEvent} (not {@code @PostConstruct}) means CBS-side
 * connectivity failures surface as logged warnings instead of fatal startup
 * errors — payzo-backend boots even when CBS is starting up later in the
 * docker-compose order.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class BankSyncBootstrap {

    private final BankSyncService bankSyncService;
    private final AtomicBoolean syncedOnce = new AtomicBoolean(false);

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        attemptSync("startup");
    }

    /** Retries every 5 minutes until the first successful sync. After that, becomes a no-op. */
    @Scheduled(fixedDelayString = "300000", initialDelayString = "300000")
    public void retryUntilSynced() {
        if (syncedOnce.get()) return;
        attemptSync("scheduled-retry");
    }

    private void attemptSync(String trigger) {
        try {
            BankSyncService.SyncResult result = bankSyncService.syncFromCbs();
            syncedOnce.set(true);
            log.info("Bank sync ({}) succeeded: {}", trigger, result);
        } catch (Exception e) {
            log.warn("Bank sync ({}) failed: {} — will retry until success", trigger, e.getMessage());
        }
    }
}
