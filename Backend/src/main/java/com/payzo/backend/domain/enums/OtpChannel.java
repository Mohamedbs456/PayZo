package com.payzo.backend.domain.enums;

/**
 * Delivery channel for an OTP. The user picks one on the channel-chooser
 * step (signup step 2a, login step 2 of 2) and the backend dispatches to
 * exactly that channel — never both. Used by signup, login, and password
 * reset.
 */
public enum OtpChannel {
    EMAIL,
    SMS
}
