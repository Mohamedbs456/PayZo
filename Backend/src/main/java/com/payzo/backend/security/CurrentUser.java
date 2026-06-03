package com.payzo.backend.security;

import org.springframework.security.core.annotation.AuthenticationPrincipal;

import java.lang.annotation.*;

/** Shorthand for {@code @AuthenticationPrincipal} on controller params, hiding the Spring Security principal type. */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@AuthenticationPrincipal
public @interface CurrentUser {
}
