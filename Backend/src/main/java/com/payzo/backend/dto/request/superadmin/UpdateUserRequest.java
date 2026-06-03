package com.payzo.backend.dto.request.superadmin;

import jakarta.validation.constraints.Email;
import lombok.Data;

import java.time.LocalDate;

/**
 * Partial-update payload for the Edit dialog on the Staff Management page.
 * Every field is nullable — the service only writes the ones that come back
 * non-null, so the SA can edit a single field without clobbering the rest.
 */
@Data
public class UpdateUserRequest {

    private String firstName;
    private String lastName;

    @Email
    private String email;

    private String phone;
    private String governorate;
    private String address;
    private LocalDate dateOfBirth;
}
