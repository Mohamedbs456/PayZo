package com.payzo.backend.service.analyst;

import com.payzo.backend.domain.entity.MlThresholdReport;
import com.payzo.backend.domain.entity.User;
import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.domain.enums.UserNotificationType;
import com.payzo.backend.dto.request.analyst.ThresholdReportRequest;
import com.payzo.backend.dto.response.analyst.ThresholdReportResponse;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.MlThresholdReportRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.service.notification.InAppNotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Analyst-authored threshold proposals routed to the SuperAdmin for sign-off, with an in-app notification on submit. */
@Service
@RequiredArgsConstructor
@Slf4j
public class MlThresholdReportService {

    private final MlThresholdReportRepository reportRepository;
    private final UserRepository userRepository;
    private final InAppNotificationService inAppNotificationService;

    @Transactional
    public ThresholdReportResponse submitReport(UUID analystId, ThresholdReportRequest request) {
        User analyst = userRepository.findById(analystId)
                .orElseThrow(() -> new ResourceNotFoundException("Analyst not found: " + analystId));

        MlThresholdReport report = new MlThresholdReport();
        report.setAnalyst(analyst);
        report.setSuggestedLowMedium(request.getSuggestedLowMedium());
        report.setSuggestedMediumHigh(request.getSuggestedMediumHigh());
        report.setDescription(request.getDescription());
        report.setJustification(request.getJustification());
        reportRepository.save(report);

        String analystName = analyst.getFirstName() + " " + analyst.getLastName();
        List<User> superAdmins = userRepository.findByRole(Role.SUPERADMIN);
        for (User sa : superAdmins) {
            inAppNotificationService.create(sa.getId(),
                    "Analyst threshold report submitted",
                    "Analyst " + analystName + " submitted an ML threshold report.",
                    UserNotificationType.ANALYST_THRESHOLD_REPORT);
        }

        log.info("Threshold report submitted: analystId={}, reportId={}", analystId, report.getId());
        return toResponse(report);
    }

    @Transactional(readOnly = true)
    public Page<ThresholdReportResponse> getAllReports(Pageable pageable) {
        return reportRepository.findAllByOrderBySubmittedAtDesc(pageable)
                .map(this::toResponse);
    }

    @Transactional
    public ThresholdReportResponse markAsRead(UUID reportId) {
        MlThresholdReport report = reportRepository.findById(reportId)
                .orElseThrow(() -> new ResourceNotFoundException("Report not found: " + reportId));
        report.setReadAt(OffsetDateTime.now());
        reportRepository.save(report);
        return toResponse(report);
    }

    private ThresholdReportResponse toResponse(MlThresholdReport r) {
        User analyst = r.getAnalyst();
        return ThresholdReportResponse.builder()
                .id(r.getId())
                .analystId(analyst.getId())
                .analystName(analyst.getFirstName() + " " + analyst.getLastName())
                .suggestedLowMedium(r.getSuggestedLowMedium())
                .suggestedMediumHigh(r.getSuggestedMediumHigh())
                .description(r.getDescription())
                .justification(r.getJustification())
                .submittedAt(r.getSubmittedAt())
                .readAt(r.getReadAt())
                .build();
    }
}
