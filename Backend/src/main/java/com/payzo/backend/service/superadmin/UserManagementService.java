package com.payzo.backend.service.superadmin;

import com.payzo.backend.domain.entity.Admin;
import com.payzo.backend.domain.entity.Analyst;
import com.payzo.backend.domain.entity.User;
import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.domain.enums.UserNotificationType;
import com.payzo.backend.domain.enums.UserStatus;
import com.payzo.backend.dto.request.superadmin.CreateUserRequest;
import com.payzo.backend.dto.request.superadmin.UpdateUserRequest;
import com.payzo.backend.dto.response.superadmin.UserResponse;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.security.BlockedUserFilter;
import com.payzo.backend.service.audit.AuditService;
import com.payzo.backend.service.integration.KeycloakAdminService;
import com.payzo.backend.service.notification.InAppNotificationService;
import com.payzo.backend.service.notification.NotificationService;
import com.payzo.backend.util.PasswordGenerator;
import com.payzo.backend.util.SearchSpecification;
import com.payzo.backend.util.UsernameGenerator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** SA-only staff CRUD on Admin and Analyst rows (D31): Keycloak round-trips before the {@code users} insert and {@link BlockedUserFilter#evictUser(UUID)} on every status flip. */
@Service
@RequiredArgsConstructor
@Slf4j
public class UserManagementService {

    private final UserRepository userRepository;
    private final KeycloakAdminService keycloakAdminService;
    private final NotificationService notificationService;
    private final InAppNotificationService inAppNotificationService;
    private final AuditService auditService;
    private final PasswordGenerator passwordGenerator;
    private final UsernameGenerator usernameGenerator;
    private final BlockedUserFilter blockedUserFilter;

    @Transactional(readOnly = true)
    public Page<UserResponse> getAdmins(String query, Pageable pageable) {
        return getUsersByRole(Role.ADMIN, query, pageable);
    }

    @Transactional(readOnly = true)
    public Page<UserResponse> getAnalysts(String query, Pageable pageable) {
        return getUsersByRole(Role.ANALYST, query, pageable);
    }

    @Transactional(readOnly = true)
    public UserResponse getAdmin(UUID id) {
        return getUserByIdAndRole(id, Role.ADMIN);
    }

    @Transactional(readOnly = true)
    public UserResponse getAnalyst(UUID id) {
        return getUserByIdAndRole(id, Role.ANALYST);
    }

    @Transactional
    public UserResponse createAdmin(CreateUserRequest request, UUID superAdminId) {
        return createBackofficeUser(request, Role.ADMIN, "ADMIN", superAdminId);
    }

    @Transactional
    public UserResponse createAnalyst(CreateUserRequest request, UUID superAdminId) {
        return createBackofficeUser(request, Role.ANALYST, "ANALYST", superAdminId);
    }

    @Transactional
    public UserResponse updateAdmin(UUID id, UpdateUserRequest request) {
        return updateUser(id, Role.ADMIN, request);
    }

    @Transactional
    public UserResponse updateAnalyst(UUID id, UpdateUserRequest request) {
        return updateUser(id, Role.ANALYST, request);
    }

    @Transactional
    public void deleteAdmin(UUID id, UUID superAdminId) {
        deleteUser(id, Role.ADMIN, superAdminId);
    }

    @Transactional
    public void deleteAnalyst(UUID id, UUID superAdminId) {
        deleteUser(id, Role.ANALYST, superAdminId);
    }

    @Transactional
    public void blockUser(UUID userId, UUID superAdminId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + userId));

        if (user.getStatus() == UserStatus.BLOCKED) {
            throw new ConflictException("User is already blocked", "ALREADY_BLOCKED");
        }
        if (user.getKeycloakId() == null) {
            throw new ConflictException("User has no Keycloak account", "INVALID_STATUS");
        }

        String realm = user.getRole() == Role.CLIENT ? "clients" : "backoffice";
        keycloakAdminService.disableUser(user.getKeycloakId(), realm);
        user.setStatus(UserStatus.BLOCKED);
        userRepository.findById(superAdminId).ifPresent(user::setDecidedBy);
        user.setDecidedAt(OffsetDateTime.now());
        userRepository.save(user);

        blockedUserFilter.evictUser(user.getKeycloakId());

        auditService.writeLog(superAdminId, "SUPERADMIN", "USER_BLOCKED",
                "USER", user.getId(), "role=" + user.getRole());

        if (user.getRole() == Role.CLIENT) {
            List<User> superAdmins = userRepository.findByRole(Role.SUPERADMIN);
            String clientName = user.getFirstName() + " " + user.getLastName();
            for (User sa : superAdmins) {
                inAppNotificationService.create(sa.getId(), "Client blocked",
                        "Client " + clientName + " has been blocked.",
                        UserNotificationType.CLIENT_BLOCKED);
            }
        }

        log.info("Blocked user: userId={}, role={}", userId, user.getRole());
    }

    @Transactional
    public void unblockUser(UUID userId, UUID superAdminId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + userId));

        if (user.getStatus() != UserStatus.BLOCKED) {
            throw new ConflictException("User is not blocked", "NOT_BLOCKED");
        }

        String realm = user.getRole() == Role.CLIENT ? "clients" : "backoffice";
        keycloakAdminService.enableUser(user.getKeycloakId(), realm);
        user.setStatus(UserStatus.ACTIVE);
        userRepository.findById(superAdminId).ifPresent(user::setDecidedBy);
        user.setDecidedAt(OffsetDateTime.now());
        userRepository.save(user);

        blockedUserFilter.evictUser(user.getKeycloakId());

        auditService.writeLog(superAdminId, "SUPERADMIN", "USER_UNBLOCKED",
                "USER", user.getId(), "role=" + user.getRole());

        if (user.getRole() == Role.CLIENT) {
            List<User> superAdmins = userRepository.findByRole(Role.SUPERADMIN);
            String clientName = user.getFirstName() + " " + user.getLastName();
            for (User sa : superAdmins) {
                inAppNotificationService.create(sa.getId(), "Client unblocked",
                        "Client " + clientName + " has been unblocked.",
                        UserNotificationType.CLIENT_UNBLOCKED);
            }
        }

        log.info("Unblocked user: userId={}, role={}", userId, user.getRole());
    }

    private Page<UserResponse> getUsersByRole(Role role, String query, Pageable pageable) {
        // Same wide-search policy as the BO Clients page — every column an
        // SA could plausibly type, plus UUID fields (id, keycloakId) for
        // pasting an identifier pulled from logs or Keycloak directly.
        Specification<User> spec = SearchSpecification.build(query,
                new String[]{
                        "firstName", "lastName", "username",
                        "email", "phone", "address", "governorate",
                },
                new String[]{"id", "keycloakId"},
                Map.of("role", role));

        return userRepository.findAll(spec, pageable)
                .map(this::toUserResponse);
    }

    private UserResponse getUserByIdAndRole(UUID id, Role expectedRole) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + id));
        if (user.getRole() != expectedRole) {
            throw new ResourceNotFoundException("User not found: " + id);
        }
        return toUserResponse(user);
    }

    private UserResponse createBackofficeUser(CreateUserRequest request, Role role,
                                               String keycloakRole, UUID superAdminId) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new ConflictException("Email already registered", "EMAIL_ALREADY_EXISTS");
        }

        // Auto-generate username (same `first.last[N]` policy used for clients) so
        // the SA never has to think about it. Password is also auto-generated and
        // emailed; the new staff member changes it on first login.
        String username = usernameGenerator.generateFor(
                request.getFirstName(), request.getLastName());
        String tempPassword = passwordGenerator.generate();

        UUID keycloakId = keycloakAdminService.createBackofficeUser(
                username, request.getEmail(),
                request.getFirstName(), request.getLastName(), keycloakRole, tempPassword);

        User user;
        if (role == Role.ADMIN) {
            user = new Admin();
        } else {
            user = new Analyst();
        }
        user.setUsername(username);
        user.setFirstName(request.getFirstName());
        user.setLastName(request.getLastName());
        user.setEmail(request.getEmail());
        user.setPhone(request.getPhone());
        user.setGovernorate(request.getGovernorate());
        user.setAddress(request.getAddress());
        user.setDateOfBirth(request.getDateOfBirth());
        user.setRole(role);
        user.setStatus(UserStatus.ACTIVE);
        user.setKeycloakId(keycloakId);
        userRepository.findById(superAdminId).ifPresent(creator -> {
            user.setCreatedBy(creator);
            user.setDecidedBy(creator);
        });
        user.setDecidedAt(OffsetDateTime.now());
        userRepository.save(user);

        notificationService.send("CREDENTIALS", request.getEmail(), null,
                Map.of("username", username, "password", tempPassword));

        auditService.writeLog(superAdminId, "SUPERADMIN",
                role == Role.ADMIN ? "ADMIN_CREATED" : "ANALYST_CREATED",
                "USER", user.getId(), null);

        // Notify SA (system confirmation)
        List<User> superAdmins = userRepository.findByRole(Role.SUPERADMIN);
        UserNotificationType createdType = role == Role.ADMIN
                ? UserNotificationType.ADMIN_CREATED : UserNotificationType.ANALYST_CREATED;
        String fullName = request.getFirstName() + " " + request.getLastName();
        for (User sa : superAdmins) {
            inAppNotificationService.create(sa.getId(), role + " created",
                    fullName + "'s account was successfully created.",
                    createdType);
        }

        // Notify colleagues (same role) about the new joiner
        List<User> colleagues = userRepository.findByRole(role);
        for (User colleague : colleagues) {
            if (!colleague.getId().equals(user.getId())) {
                inAppNotificationService.create(colleague.getId(), "New colleague",
                        fullName + " joined us as " + (role == Role.ADMIN ? "an Admin" : "an Analyst") + ".",
                        UserNotificationType.COLLEAGUE_JOINED);
            }
        }

        log.info("Created {} user: id={}, keycloakId={}", role, user.getId(), keycloakId);
        return toUserResponse(user);
    }

    private UserResponse updateUser(UUID id, Role expectedRole, UpdateUserRequest request) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + id));
        if (user.getRole() != expectedRole) {
            throw new ResourceNotFoundException("User not found: " + id);
        }

        if (request.getFirstName() != null) {
            user.setFirstName(request.getFirstName());
        }
        if (request.getLastName() != null) {
            user.setLastName(request.getLastName());
        }
        if (request.getEmail() != null) {
            if (!request.getEmail().equals(user.getEmail()) &&
                    userRepository.existsByEmail(request.getEmail())) {
                throw new ConflictException("Email already registered", "EMAIL_ALREADY_EXISTS");
            }
            user.setEmail(request.getEmail());
        }
        // Per-field nullness check so the SA can update one field without
        // wiping the others. Empty strings are accepted as explicit clears.
        if (request.getPhone() != null) user.setPhone(request.getPhone());
        if (request.getGovernorate() != null) user.setGovernorate(request.getGovernorate());
        if (request.getAddress() != null) user.setAddress(request.getAddress());
        if (request.getDateOfBirth() != null) user.setDateOfBirth(request.getDateOfBirth());
        userRepository.save(user);

        log.info("Updated {} user: id={}", expectedRole, id);
        return toUserResponse(user);
    }

    private void deleteUser(UUID id, Role expectedRole, UUID superAdminId) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + id));
        if (user.getRole() != expectedRole) {
            throw new ResourceNotFoundException("User not found: " + id);
        }

        String fullName = user.getFirstName() + " " + user.getLastName();

        if (user.getKeycloakId() != null) {
            keycloakAdminService.deleteUser(user.getKeycloakId(), "backoffice");
        }
        userRepository.delete(user);

        auditService.writeLog(superAdminId, "SUPERADMIN",
                expectedRole == Role.ADMIN ? "ADMIN_DELETED" : "ANALYST_DELETED",
                "USER", id, null);

        // Notify SA (system confirmation)
        List<User> superAdmins = userRepository.findByRole(Role.SUPERADMIN);
        UserNotificationType deletedType = expectedRole == Role.ADMIN
                ? UserNotificationType.ADMIN_DELETED : UserNotificationType.ANALYST_DELETED;
        for (User sa : superAdmins) {
            inAppNotificationService.create(sa.getId(), expectedRole + " deleted",
                    fullName + "'s account has been deleted.",
                    deletedType);
        }

        // Notify remaining colleagues
        List<User> colleagues = userRepository.findByRole(expectedRole);
        for (User colleague : colleagues) {
            inAppNotificationService.create(colleague.getId(), "Colleague left",
                    fullName + " has left us.",
                    UserNotificationType.COLLEAGUE_LEFT);
        }

        log.info("Deleted {} user: id={}", expectedRole, id);
    }

    private UserResponse toUserResponse(User user) {
        return UserResponse.builder()
                .id(user.getId())
                .keycloakId(user.getKeycloakId())
                .username(user.getUsername())
                .firstName(user.getFirstName())
                .lastName(user.getLastName())
                .email(user.getEmail())
                .phone(user.getPhone())
                .governorate(user.getGovernorate())
                .address(user.getAddress())
                .dateOfBirth(user.getDateOfBirth())
                .profilePictureUrl(user.getProfilePictureUrl())
                .role(user.getRole())
                .status(user.getStatus())
                .createdAt(user.getCreatedAt())
                .updatedAt(user.getUpdatedAt())
                .firstLoginCompleted(user.isFirstLoginCompleted())
                .createdByName(formatActor(user.getCreatedBy()))
                .decidedByName(formatActor(user.getDecidedBy()))
                .decidedAt(user.getDecidedAt())
                .decisionReason(user.getDecisionReason())
                .build();
    }

    /** Renders "Role · First Last" for a user FK reference. Null-safe. */
    private static String formatActor(User actor) {
        if (actor == null) return null;
        String roleLabel = switch (actor.getRole()) {
            case ADMIN -> "Admin";
            case ANALYST -> "Analyst";
            case SUPERADMIN -> "SuperAdmin";
            default -> actor.getRole().name();
        };
        return roleLabel + " · " + actor.getFirstName() + " " + actor.getLastName();
    }
}
