package com.payzo.backend.service.client;

import com.payzo.backend.domain.entity.Beneficiary;
import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.dto.request.client.BeneficiaryCreateRequest;
import com.payzo.backend.dto.request.client.BeneficiaryNicknameUpdateRequest;
import com.payzo.backend.dto.response.client.BeneficiaryResponse;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.exception.ValidationException;
import com.payzo.backend.repository.BeneficiaryRepository;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsAccountData;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsClientData;
import com.payzo.backend.util.NameMatcher;
import com.payzo.backend.util.RibValidator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Owns {@link Beneficiary} lifecycle and the post-transfer usage recording. RIB
 * is validated client-side and again here on every create + recordUsage so a
 * malformed value never reaches CBS.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class BeneficiaryService {

    private final BeneficiaryRepository beneficiaryRepository;
    private final ClientRepository clientRepository;
    private final CbsIntegrationService cbsIntegrationService;

    @Transactional(readOnly = true)
    public Page<BeneficiaryResponse> list(UUID clientId, Pageable pageable) {
        Page<Beneficiary> page = beneficiaryRepository.findAllForClient(clientId, pageable);

        Set<String> ribs = page.getContent().stream()
                .map(Beneficiary::getAccountNumber)
                .collect(Collectors.toSet());

        Map<String, CbsAccountData> accountsByRib;
        try {
            accountsByRib = cbsIntegrationService.getAccountsByNumbers(ribs);
        } catch (Exception e) {
            log.warn("CBS batch account lookup failed; rendering beneficiaries without enrichment", e);
            accountsByRib = Map.of();
        }

        Set<String> cins = accountsByRib.values().stream()
                .map(CbsAccountData::clientCin)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        Map<String, Client> payzoClientsByCin = cins.isEmpty()
                ? Map.of()
                : clientRepository.findByCinIn(cins).stream()
                        .collect(Collectors.toMap(Client::getCin, Function.identity()));

        final Map<String, CbsAccountData> accountsByRibFinal = accountsByRib;
        return page.map(b -> toResponse(b, accountsByRibFinal, payzoClientsByCin));
    }

    @Transactional
    public BeneficiaryResponse create(UUID clientId, BeneficiaryCreateRequest request) {
        String rib = RibValidator.normalize(request.getRib());
        if (!RibValidator.isValid(rib)) {
            throw new ValidationException("Invalid RIB", "INVALID_RIB");
        }
        if (beneficiaryRepository.existsByClientIdAndAccountNumber(clientId, rib)) {
            throw new ConflictException("This recipient is already saved", "BENEFICIARY_EXISTS");
        }

        Client client = clientRepository.findById(clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + clientId));

        CbsAccountData account = cbsIntegrationService.getAccountByNumber(rib);
        CbsClientData holder = cbsIntegrationService.getClientByCin(account.clientCin());

        if (!NameMatcher.matches(request.getFirstName(), holder.firstName())
                || !NameMatcher.matches(request.getLastName(), holder.lastName())) {
            throw new ValidationException(
                    "The first and last name don't match the account holder", "NAME_MISMATCH");
        }

        Beneficiary b = new Beneficiary();
        b.setClient(client);
        b.setAccountNumber(rib);
        b.setCachedFirstName(holder.firstName());
        b.setCachedLastName(holder.lastName());
        b.setBankCode(account.bankCode());
        b.setNickname(emptyToNull(request.getNickname()));
        b.setFavorite(false);
        b.setTransferCount(0);
        beneficiaryRepository.save(b);

        log.info("Beneficiary created: clientId={} rib={}", clientId, mask(rib));
        return toResponse(b);
    }

    @Transactional
    public BeneficiaryResponse updateNickname(UUID clientId, UUID beneficiaryId,
                                              BeneficiaryNicknameUpdateRequest request) {
        Beneficiary b = beneficiaryRepository.findByIdAndClientId(beneficiaryId, clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Beneficiary not found"));
        b.setNickname(emptyToNull(request.getNickname()));
        beneficiaryRepository.save(b);
        return toResponse(b);
    }

    @Transactional
    public BeneficiaryResponse toggleFavorite(UUID clientId, UUID beneficiaryId) {
        Beneficiary b = beneficiaryRepository.findByIdAndClientId(beneficiaryId, clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Beneficiary not found"));
        b.setFavorite(!b.isFavorite());
        beneficiaryRepository.save(b);
        return toResponse(b);
    }

    @Transactional
    public void delete(UUID clientId, UUID beneficiaryId) {
        Beneficiary b = beneficiaryRepository.findByIdAndClientId(beneficiaryId, clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Beneficiary not found"));
        beneficiaryRepository.delete(b);
    }

    /**
     * Called by {@code TransferService} after every APPROVED transfer. Inserts
     * a beneficiary row if none exists for {@code (clientId, rib)}, otherwise
     * bumps {@code transferCount}, sets {@code lastUsedAt}, refreshes cached
     * names, and stamps {@code confirmedAt} the first time around. If
     * {@code saveRequested} is true on a brand-new entry, the row is created
     * regardless of whether it had been used before; if false and no row
     * exists, we still create an unconfirmed row so the relationship is
     * traceable for ML features — the UI can filter on
     * {@code transferCount > 0} to show only confirmed beneficiaries.
     */
    @Transactional
    public void recordUsage(UUID clientId, String rib, String firstName, String lastName,
                             String bankCode, boolean saveRequested, String nickname) {
        String normalized = RibValidator.normalize(rib);
        OffsetDateTime now = OffsetDateTime.now();

        Optional<Beneficiary> existing =
                beneficiaryRepository.findByClientIdAndAccountNumber(clientId, normalized);

        if (existing.isPresent()) {
            Beneficiary b = existing.get();
            b.setTransferCount(b.getTransferCount() + 1);
            b.setLastUsedAt(now);
            if (b.getConfirmedAt() == null) b.setConfirmedAt(now);
            if (b.getFirstUsedAt() == null) b.setFirstUsedAt(now);
            if (firstName != null) b.setCachedFirstName(firstName);
            if (lastName != null) b.setCachedLastName(lastName);
            if (saveRequested && nickname != null && !nickname.isBlank() && b.getNickname() == null) {
                b.setNickname(nickname);
            }
            beneficiaryRepository.save(b);
            return;
        }

        Client client = clientRepository.findById(clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + clientId));

        Beneficiary b = new Beneficiary();
        b.setClient(client);
        b.setAccountNumber(normalized);
        b.setCachedFirstName(firstName != null ? firstName : "");
        b.setCachedLastName(lastName != null ? lastName : "");
        b.setBankCode(bankCode);
        b.setNickname(saveRequested ? emptyToNull(nickname) : null);
        b.setFavorite(false);
        b.setTransferCount(1);
        b.setFirstUsedAt(now);
        b.setLastUsedAt(now);
        b.setConfirmedAt(now);
        beneficiaryRepository.save(b);
    }

    /**
     * Single-row mapper used by create/update/toggleFavorite. Resolves the CBS
     * account + PayZo user inline so the response shape matches the paged list —
     * required by callers (e.g. the favourites bubble row) that key avatar
     * rendering on {@code payzoUser} + {@code profilePictureUrl}. CBS failures
     * fall through to an unenriched row rather than failing the request.
     */
    private BeneficiaryResponse toResponse(Beneficiary b) {
        Map<String, CbsAccountData> accountsByRib;
        try {
            accountsByRib = cbsIntegrationService.getAccountsByNumbers(Set.of(b.getAccountNumber()));
        } catch (Exception e) {
            log.warn("CBS lookup failed for beneficiary {}, returning without enrichment", b.getId(), e);
            accountsByRib = Map.of();
        }
        Set<String> cins = accountsByRib.values().stream()
                .map(CbsAccountData::clientCin)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<String, Client> payzoByCin = cins.isEmpty()
                ? Map.of()
                : clientRepository.findByCinIn(cins).stream()
                        .collect(Collectors.toMap(Client::getCin, Function.identity()));
        return toResponse(b, accountsByRib, payzoByCin);
    }

    private BeneficiaryResponse toResponse(Beneficiary b,
                                           Map<String, CbsAccountData> accountsByRib,
                                           Map<String, Client> payzoClientsByCin) {
        String displayName = b.getNickname() != null
                ? b.getNickname()
                : (b.getCachedFirstName() + " " + b.getCachedLastName()).trim();

        CbsAccountData account = accountsByRib.get(b.getAccountNumber());
        Client payzoClient = (account != null && account.clientCin() != null)
                ? payzoClientsByCin.get(account.clientCin())
                : null;

        return BeneficiaryResponse.builder()
                .id(b.getId())
                .accountNumber(b.getAccountNumber())
                .displayName(displayName)
                .nickname(b.getNickname())
                .bankCode(b.getBankCode())
                .favorite(b.isFavorite())
                .transferCount(b.getTransferCount())
                .confirmedAt(b.getConfirmedAt())
                .lastUsedAt(b.getLastUsedAt())
                .createdAt(b.getCreatedAt())
                .initials(initialsOf(b.getCachedFirstName(), b.getCachedLastName()))
                .payzoUser(payzoClient != null)
                .profilePictureUrl(payzoClient != null ? payzoClient.getProfilePictureUrl() : null)
                .build();
    }

    private static String initialsOf(String first, String last) {
        char a = first != null && !first.isBlank() ? Character.toUpperCase(first.charAt(0)) : '?';
        char b = last  != null && !last.isBlank()  ? Character.toUpperCase(last.charAt(0))  : '?';
        return "" + a + b;
    }

    private static String emptyToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }

    private static String mask(String rib) {
        if (rib == null || rib.length() < 6) return "****";
        return rib.substring(0, 2) + "****" + rib.substring(rib.length() - 2);
    }
}
