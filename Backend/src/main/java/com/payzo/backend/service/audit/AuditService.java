package com.payzo.backend.service.audit;

import com.payzo.backend.domain.entity.AuditLog;
import com.payzo.backend.domain.entity.User;
import com.payzo.backend.repository.AuditLogRepository;
import com.payzo.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.UUID;

/** Single synchronous write-path for {@code audit_logs} so every actor decision commits inside its own transaction. */
@Service
@RequiredArgsConstructor
@Slf4j
public class AuditService {

    private final AuditLogRepository auditLogRepository;
    private final UserRepository userRepository;

    public void writeLog(UUID actorId, String actorRole, String action,
                         String targetType, UUID targetId, String metadata) {
        AuditLog entry = new AuditLog();

        if (actorId != null) {
            userRepository.findById(actorId).ifPresent(entry::setActor);
        }
        entry.setActorRole(actorRole);
        entry.setAction(action);
        entry.setTargetType(targetType);
        entry.setTargetId(targetId);
        entry.setMetadata(metadata);

        auditLogRepository.save(entry);
        log.debug("Audit: action={} targetType={} targetId={}", action, targetType, targetId);
    }
}
