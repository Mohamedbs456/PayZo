package com.payzo.backend.dto.request.client;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Request body for {@code POST /api/v1/client/transfers}.
 *
 * <p>Three mutually-exclusive ways to address the recipient:
 * <ul>
 *   <li><b>Saved beneficiary</b> — only {@code beneficiaryId} is sent; backend
 *       expands it to the saved RIB + cached names. Name re-verification is
 *       skipped (verified at beneficiary create time).</li>
 *   <li><b>PayZo username</b> (D53) — only {@code payzoUsername} is sent;
 *       backend resolves to the recipient's {@code defaultAccountId}. Name
 *       re-verification is skipped (username is identity proof).</li>
 *   <li><b>Manual RIB+name</b> — {@code destRib + destFirstName + destLastName}
 *       are all sent; backend re-verifies the typed name against CBS. The only
 *       path that works for non-PayZo recipients.</li>
 * </ul>
 *
 * <p>Exactly one of the three shapes must be present — see
 * {@link #isRecipientResolvable()}.
 */
@Data
public class TransferRequest {

    @NotBlank
    @Pattern(regexp = "^\\d{20}$", message = "Source account number must be exactly 20 numeric digits (RIB)")
    private String sourceAccountNumber;

    /** Saved-beneficiary shortcut. */
    private UUID beneficiaryId;

    /** PayZo-username shortcut (D53). With or without leading @ accepted server-side. */
    @Size(max = 64)
    private String payzoUsername;

    /** Manual mode: 20-digit Tunisian RIB. */
    private String destRib;

    /** Manual mode: required, verified against CBS. */
    @Size(max = 100)
    private String destFirstName;

    /** Manual mode: required, verified against CBS. */
    @Size(max = 100)
    private String destLastName;

    /** Manual mode only: if true, the recipient is also saved as a beneficiary on this transfer. */
    private Boolean saveBeneficiary;

    /** Manual mode only: optional nickname to attach when saving. */
    @Size(max = 64)
    private String beneficiaryNickname;

    @NotNull
    @DecimalMin(value = "0.01")
    private BigDecimal amount;

    @Size(max = 500)
    private String motif;

    @AssertTrue(message = "Provide exactly one of: beneficiaryId, payzoUsername, or destRib + destFirstName + destLastName")
    public boolean isRecipientResolvable() {
        int modes = 0;
        if (beneficiaryId != null) modes++;
        if (payzoUsername != null && !payzoUsername.isBlank()) modes++;
        boolean manualComplete = destRib != null && !destRib.isBlank()
                && destFirstName != null && !destFirstName.isBlank()
                && destLastName != null && !destLastName.isBlank();
        if (manualComplete) modes++;
        return modes == 1;
    }
}
