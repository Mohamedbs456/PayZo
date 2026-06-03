package com.payzo.backend.dto.request.auth;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Body for {@code POST /auth/first-login-complete}. Carries the new
 * password the freshly-approved client typed into the un-dismissable
 * forced-rotation modal on the dashboard. The endpoint pushes this
 * value into Keycloak before flipping {@code firstLoginCompleted=true},
 * otherwise the rotation is a no-op and the temp credential keeps
 * working — the symptom we just hit in dev.
 *
 * <p>Validated server-side via {@link com.payzo.backend.util.PasswordPolicy} —
 * deliberately not annotated with a regex here so policy violations
 * surface as structured 422 errors with a violation list instead of a
 * generic 400 from bean-validation.
 */
@Data
public class FirstLoginCompleteRequest {

    @NotBlank
    private String newPassword;
}
