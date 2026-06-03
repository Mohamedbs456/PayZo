package com.payzo.cbs.dto;

public record ClientResponse(String cin, String firstName, String lastName,
                              String email, String phone, java.time.LocalDate dateOfBirth,
                              String address, String governorate) {}
