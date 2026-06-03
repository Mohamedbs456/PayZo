package com.payzo.backend.domain.entity;

import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import lombok.Getter;
import lombok.Setter;

/** STI subtype for the platform owner role, created in Keycloak and synced into {@code users} by {@code DataInitializer} or JIT-provisioned on first request. */
@Entity
@DiscriminatorValue("SUPERADMIN")
@Getter
@Setter
public class SuperAdmin extends User {
}
