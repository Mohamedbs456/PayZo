package com.payzo.backend.mapper;

import com.payzo.backend.domain.entity.AuditLog;
import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.entity.User;
import com.payzo.backend.dto.response.admin.AuditLogResponse;
import com.payzo.backend.dto.response.admin.SubscriptionResponse;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper
public interface UserMapper {

    @Mapping(source = "id", target = "userId")
    @Mapping(target = "createdByName", expression = "java(formatCreatedBy(client.getCreatedBy()))")
    @Mapping(target = "decidedByName", expression = "java(formatDecidedBy(client.getDecidedBy()))")
    SubscriptionResponse toSubscriptionResponse(Client client);

    AuditLogResponse toAuditLogResponse(AuditLog auditLog);

    /**
     * Renders the user that originally created this record:
     *   - createdBy == null → "Self-registered" (the standard self-signup path)
     *   - otherwise         → "Admin · First Last" (direct subscription by an admin)
     */
    default String formatCreatedBy(User createdBy) {
        if (createdBy == null) {
            return "Self-registered";
        }
        return formatDecidedBy(createdBy);
    }

    /**
     * Renders the actor of the most-recent lifecycle decision as
     * "Admin · First Last" / "Analyst · …" / "SuperAdmin · …". Returns null when no
     * decision has been recorded yet (e.g. PENDING clients with no admin action).
     */
    default String formatDecidedBy(User decidedBy) {
        if (decidedBy == null) {
            return null;
        }
        String roleLabel = switch (decidedBy.getRole()) {
            case ADMIN -> "Admin";
            case ANALYST -> "Analyst";
            case SUPERADMIN -> "SuperAdmin";
            default -> decidedBy.getRole().name();
        };
        return roleLabel + " · " + decidedBy.getFirstName() + " " + decidedBy.getLastName();
    }
}
