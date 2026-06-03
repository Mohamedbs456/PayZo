package com.payzo.backend.dto.request.superadmin;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.time.LocalDate;

/**
 * Payload for creating an admin or analyst from the Staff Management page.
 * Username is auto-generated server-side (same `usernameGenerator.generateFor`
 * helper used by client direct-subscribe), so the SA never types it.
 *
 * Phone / governorate / address / DOB are accepted (optional) so the
 * expanded staff view has fields to render.
 */
@Data
public class CreateUserRequest {

    @NotBlank
    private String firstName;

    @NotBlank
    private String lastName;

    @NotBlank
    @Email
    private String email;

    private String phone;
    private String governorate;
    private String address;
    private LocalDate dateOfBirth;
}
