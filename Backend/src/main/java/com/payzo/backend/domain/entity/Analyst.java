package com.payzo.backend.domain.entity;

import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import lombok.Getter;
import lombok.Setter;

/** STI subtype for the fraud-review role (D33) owning the alert queue and threshold proposals. */
@Entity
@DiscriminatorValue("ANALYST")
@Getter
@Setter
public class Analyst extends User {
}
