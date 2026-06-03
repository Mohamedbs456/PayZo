package com.payzo.backend.domain.entity;

import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import lombok.Getter;
import lombok.Setter;

/** STI subtype for backoffice clerk users (subscription review and client onboarding). */
@Entity
@DiscriminatorValue("ADMIN")
@Getter
@Setter
public class Admin extends User {
}
