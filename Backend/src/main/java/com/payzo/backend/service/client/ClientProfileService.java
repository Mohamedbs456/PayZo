package com.payzo.backend.service.client;

import com.payzo.backend.cbs.entity.CbsClient;
import com.payzo.backend.cbs.repository.CbsClientRepository;
import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.dto.client.ClientProfile;
import com.payzo.backend.exception.CbsClientNotFoundException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.ClientRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Source-of-truth helper for client identity (Batch 9 / D2 mental model).
 *
 * <p>After Batch 9, payzo_db.users no longer carries email/phone/address/governorate/dob
 * for CLIENT rows — those live exclusively in cbs_db.cbs_clients (~340 MB saved across
 * ~2 M client rows; address staleness eliminated). firstName/lastName stay on users as
 * a tiny cache so existing search keeps working without a CBS-side rewrite.
 *
 * <p>Anywhere a service needs full client identity (notifications, OTP delivery,
 * profile pages, admin views), it goes through this helper. That enforces the rule
 * in code, not just in documentation: <em>CBS is the source of truth for client
 * identity, payzo_db is the source of truth for PayZo state.</em>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ClientProfileService {

    private final ClientRepository clientRepository;
    private final CbsClientRepository cbsClientRepository;

    @Transactional(readOnly = true)
    public ClientProfile getProfile(UUID clientId) {
        Client client = clientRepository.findById(clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + clientId));
        return forClient(client);
    }

    @Transactional(readOnly = true)
    public ClientProfile getProfileByCin(String cin) {
        Client client = clientRepository.findByCin(cin)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: cin=" + cin));
        return forClient(client);
    }

    /**
     * Use when the caller already loaded the {@link Client} — avoids the second SELECT.
     *
     * <p>Intentionally NOT {@code @Transactional}: callers always have an outer
     * transaction (BO list endpoints, profile pages). A nested @Transactional here
     * would let the inner TxInterceptor mark the outer transaction rollback-only
     * the moment we throw {@link CbsClientNotFoundException} — even though the
     * caller catches the exception. That manifested as a 500
     * "Transaction silently rolled back" on /admin/clients whenever any row in
     * the page had no CBS counterpart.
     */
    public ClientProfile forClient(Client client) {
        String cin = client.getCin();
        if (cin == null) {
            // Defensive — a Client with no CIN can't be linked to CBS. Surface clearly
            // rather than producing a misleading "CBS missing" error.
            throw new IllegalStateException(
                    "Client " + client.getId() + " has no CIN — cannot resolve identity from CBS");
        }
        CbsClient cbs = cbsClientRepository.findByCin(cin)
                .orElseThrow(() -> new CbsClientNotFoundException(
                        "CBS missing client for cin=" + cin));
        return new ClientProfile(
                client.getId(),
                client.getKeycloakId(),
                client.getCin(),
                client.getUsername(),
                client.getFirstName(),
                client.getLastName(),
                client.getProfilePictureUrl(),
                client.getTrustScore(),
                client.getDefaultAccountId(),
                client.getStatus(),
                client.isFirstLoginCompleted(),
                cbs.getEmail(),
                cbs.getPhone(),
                cbs.getAddress(),
                cbs.getGovernorate(),
                cbs.getDateOfBirth()
        );
    }
}
