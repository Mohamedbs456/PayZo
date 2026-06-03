package com.payzo.cbs.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;

@Entity
@Table(name = "cbs_clients")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CbsClient {

    @Id
    @Column(length = 8)
    private String cin;

    @Column(nullable = false)
    private String firstName;

    @Column(nullable = false)
    private String lastName;

    @Column(nullable = false)
    private String email;

    @Column(nullable = false, length = 15)
    private String phone;

    private LocalDate dateOfBirth;

    private String address;

    @Column(length = 50)
    private String governorate;
}
