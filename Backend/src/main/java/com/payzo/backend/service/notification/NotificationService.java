package com.payzo.backend.service.notification;

import com.payzo.backend.domain.entity.Notification;
import com.payzo.backend.domain.enums.NotificationStatus;
import com.payzo.backend.domain.enums.NotificationType;
import com.payzo.backend.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * Async fan-out for outbound notifications. Email goes through JavaMailSender
 * (Gmail SMTP) and SMS through Vonage; both writes also persist a Notification
 * row so FAILED entries get picked up by the @Scheduled retry loop (up to 3
 * times). In-app bell notifications use InAppNotificationService; this one
 * only handles external channels.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationService {

    private final EmailService emailService;
    private final SmsService smsService;
    private final NotificationRepository notificationRepository;

    @Value("${otp.delivery.enabled}")
    private boolean deliveryEnabled;

    private static final int MAX_RETRIES = 3;

    @Async
    public void send(String templateKey, String recipientEmail, String recipientPhone,
                     Object templateData) {
        Map<String, Object> vars = templateData instanceof Map
                ? (Map<String, Object>) templateData
                : Map.of();

        String subject = renderSubject(templateKey);
        String body = renderBody(templateKey, vars);

        if (recipientEmail != null) {
            dispatchEmail(recipientEmail, templateKey, subject, body);
        }

        if (recipientPhone != null) {
            dispatchSms(recipientPhone, templateKey, body);
        }
    }

    private void dispatchEmail(String email, String templateKey, String subject, String body) {
        Notification record = new Notification();
        record.setRecipientEmail(email);
        record.setType(NotificationType.EMAIL);
        record.setTemplateKey(templateKey);
        record.setSubject(subject);
        record.setContent(body);

        if (!deliveryEnabled) {
            log.info("[NOTIFICATION DEV] EMAIL to={} template={} body={}", email, templateKey, body);
            record.setStatus(NotificationStatus.SENT);
            record.setSentAt(OffsetDateTime.now());
            notificationRepository.save(record);
            return;
        }

        try {
            emailService.send(email, subject, body);
            record.setStatus(NotificationStatus.SENT);
            record.setSentAt(OffsetDateTime.now());
        } catch (Exception e) {
            log.error("Email dispatch failed: to={}, template={}", email, templateKey, e);
            record.setStatus(NotificationStatus.FAILED);
        }
        notificationRepository.save(record);
    }

    private void dispatchSms(String phone, String templateKey, String body) {
        Notification record = new Notification();
        record.setRecipientPhone(phone);
        record.setType(NotificationType.SMS);
        record.setTemplateKey(templateKey);
        record.setContent(body);

        if (!deliveryEnabled) {
            log.info("[NOTIFICATION DEV] SMS to={} template={} body={}", phone, templateKey, body);
            record.setStatus(NotificationStatus.SENT);
            record.setSentAt(OffsetDateTime.now());
            notificationRepository.save(record);
            return;
        }

        try {
            smsService.send(phone, body);
            record.setStatus(NotificationStatus.SENT);
            record.setSentAt(OffsetDateTime.now());
        } catch (Exception e) {
            log.error("SMS dispatch failed: to={}, template={}", phone, templateKey, e);
            record.setStatus(NotificationStatus.FAILED);
        }
        notificationRepository.save(record);
    }

    @Scheduled(fixedDelay = 300_000)
    public void retryFailedNotifications() {
        List<Notification> failed = notificationRepository
                .findByStatusAndRetryCountLessThan(NotificationStatus.FAILED, MAX_RETRIES);

        if (failed.isEmpty()) return;

        log.info("Retrying {} failed notifications", failed.size());

        for (Notification n : failed) {
            n.setRetryCount(n.getRetryCount() + 1);

            if (!deliveryEnabled) {
                log.info("[NOTIFICATION RETRY DEV] type={} to={} template={}",
                        n.getType(), n.getRecipientEmail(), n.getTemplateKey());
                n.setStatus(NotificationStatus.SENT);
                n.setSentAt(OffsetDateTime.now());
                notificationRepository.save(n);
                continue;
            }

            try {
                if (n.getType() == NotificationType.EMAIL) {
                    emailService.send(n.getRecipientEmail(), n.getSubject(), n.getContent());
                } else {
                    smsService.send(n.getRecipientPhone(), n.getContent());
                }
                n.setStatus(NotificationStatus.SENT);
                n.setSentAt(OffsetDateTime.now());
            } catch (Exception e) {
                log.error("Retry failed: id={}, attempt={}", n.getId(), n.getRetryCount(), e);
            }
            notificationRepository.save(n);
        }
    }

    private String renderSubject(String templateKey) {
        return switch (templateKey) {
            case "OTP" -> "PayZo — Your verification code";
            case "WELCOME_PENDING" -> "PayZo — Registration received";
            case "CREDENTIALS" -> "PayZo — Your account credentials";
            case "REJECTION" -> "PayZo — Subscription update";
            case "TRANSFER_APPROVED" -> "PayZo — Transfer approved";
            case "TRANSFER_RECEIVED" -> "PayZo — You received a transfer";
            case "TRANSFER_REJECTED" -> "PayZo — Transfer rejected";
            case "ACCOUNT_BLOCKED" -> "PayZo — Account suspended";
            case "ACCOUNT_UNBLOCKED" -> "PayZo — Account reactivated";
            case "BANK_DEACTIVATED" -> "PayZo — Bank deactivated";
            default -> "PayZo — Notification";
        };
    }

    private String renderBody(String templateKey, Map<String, Object> vars) {
        String headline;
        String preheader;
        String inner;

        switch (templateKey) {
            case "OTP" -> {
                headline = "Your verification code";
                preheader = "Use the code below to finish signing in.";
                inner = """
                        <p style="margin:0 0 16px;">Use the code below to finish your action. It expires in <strong>5 minutes</strong> and can only be used once.</p>
                        <div style="margin:24px 0;text-align:center;">
                          <div style="display:inline-block;padding:16px 28px;background:#f8f0e5;border-radius:12px;font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:700;letter-spacing:8px;color:#2a1f14;">%s</div>
                        </div>
                        <p style="margin:0;color:#8f857b;font-size:13px;">If you didn't request this, ignore this email — your account is safe.</p>
                        """.formatted(vars.getOrDefault("code", "------"));
            }
            case "WELCOME_PENDING" -> {
                headline = "Registration received";
                preheader = "We're reviewing your PayZo application.";
                inner = """
                        <p style="margin:0 0 14px;">Thanks for signing up to PayZo — Tunisia's intelligent digital bank.</p>
                        <p style="margin:0 0 14px;">An administrator is reviewing your application. You'll get another email as soon as it's approved.</p>
                        <p style="margin:0;color:#8f857b;font-size:13px;">No action is required from you right now.</p>
                        """;
            }
            case "CREDENTIALS" -> {
                // Both backoffice and client paths route here. Backoffice uses
                // `username`; clients use `cin`. Show whichever was provided
                // and label the field generically.
                Object login = vars.getOrDefault("username", vars.getOrDefault("cin", ""));
                inner = """
                        <p style="margin:0 0 16px;">Welcome to PayZo. Your account is ready — sign in with the credentials below and pick a new password on first login.</p>
                        <table role="presentation" style="margin:20px 0;border-collapse:separate;border-spacing:0;width:100%%;">
                          <tr>
                            <td style="padding:14px 16px;background:#f8f0e5;border-radius:12px 12px 0 0;font-family:'JetBrains Mono',monospace;">
                              <div style="font-size:10px;font-weight:700;letter-spacing:1.4px;color:#7a4a28;text-transform:uppercase;margin-bottom:4px;">Username</div>
                              <div style="font-size:15px;font-weight:600;color:#2a1f14;">%s</div>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:14px 16px;background:#e2c7aa;border-radius:0 0 12px 12px;font-family:'JetBrains Mono',monospace;">
                              <div style="font-size:10px;font-weight:700;letter-spacing:1.4px;color:#7a4a28;text-transform:uppercase;margin-bottom:4px;">Temporary password</div>
                              <div style="font-size:15px;font-weight:700;color:#2a1f14;">%s</div>
                            </td>
                          </tr>
                        </table>
                        <p style="margin:0 0 8px;color:#2a1f14;"><strong>You'll be asked to set a new password the first time you sign in.</strong></p>
                        <p style="margin:0;color:#8f857b;font-size:13px;">Don't share these credentials with anyone — PayZo will never ask for them.</p>
                        """.formatted(login, vars.getOrDefault("password", ""));
                headline = "Welcome to PayZo";
                preheader = "Your login details are inside.";
            }
            case "REJECTION" -> {
                headline = "Subscription update";
                preheader = "Your PayZo application was declined.";
                inner = """
                        <p style="margin:0 0 14px;">After review, your PayZo subscription request was not approved.</p>
                        <div style="margin:18px 0;padding:14px 16px;background:#fdebe0;border-radius:12px;border-left:4px solid #cf821a;">
                          <div style="font-size:10px;font-weight:700;letter-spacing:1.4px;color:#8a4a1c;text-transform:uppercase;margin-bottom:6px;">Reason</div>
                          <div style="font-size:14px;color:#2a1f14;">%s</div>
                        </div>
                        <p style="margin:0;color:#8f857b;font-size:13px;">You can contact our support team if you believe this was a mistake.</p>
                        """.formatted(vars.getOrDefault("reason", "No reason provided"));
            }
            case "TRANSFER_APPROVED" -> {
                headline = "Transfer approved";
                preheader = "Your PayZo transfer has been executed.";
                inner = """
                        <p style="margin:0 0 14px;">Good news — your transfer was approved and executed by your bank.</p>
                        <table role="presentation" style="margin:18px 0;border-collapse:separate;border-spacing:0;width:100%%;background:#f8f0e5;border-radius:12px;">
                          <tr><td style="padding:12px 16px;font-size:11px;color:#7a4a28;text-transform:uppercase;letter-spacing:1px;">Reference</td>
                              <td style="padding:12px 16px;text-align:right;font-family:'JetBrains Mono',monospace;color:#2a1f14;">%s</td></tr>
                          <tr><td style="padding:12px 16px;font-size:11px;color:#7a4a28;text-transform:uppercase;letter-spacing:1px;">Amount</td>
                              <td style="padding:12px 16px;text-align:right;font-weight:700;color:#2a1f14;">%s TND</td></tr>
                        </table>
                        """.formatted(vars.getOrDefault("reference", ""), vars.getOrDefault("amount", ""));
            }
            case "TRANSFER_RECEIVED" -> {
                headline = "Transfer received";
                preheader = "You received a payment via PayZo.";
                boolean joinCta = Boolean.TRUE.equals(vars.get("joinCta"));
                String ctaBlock = joinCta ? """
                        <div style="margin:18px 0;padding:16px 18px;background:#f8f0e5;border-radius:12px;border-left:4px solid #cf821a;">
                          <p style="margin:0 0 8px;color:#2a1f14;font-weight:600;">Don't have a PayZo account yet?</p>
                          <p style="margin:0 0 12px;color:#2a1f14;font-size:13px;">Track every incoming payment, send to anyone in 60 seconds, and get fraud protection on every move.</p>
                          <a href="%s" style="display:inline-block;padding:10px 18px;background:#2a1f14;color:#f8f0e5;text-decoration:none;border-radius:10px;font-weight:600;font-size:13px;">Join PayZo</a>
                        </div>
                        """.formatted(escapeHtml(String.valueOf(vars.getOrDefault("signupUrl", "")))) : "";
                inner = """
                        <p style="margin:0 0 14px;"><strong>%s</strong> sent you a payment.</p>
                        <table role="presentation" style="margin:18px 0;border-collapse:separate;border-spacing:0;width:100%%;background:#f8f0e5;border-radius:12px;">
                          <tr><td style="padding:12px 16px;font-size:11px;color:#7a4a28;text-transform:uppercase;letter-spacing:1px;">Amount</td>
                              <td style="padding:12px 16px;text-align:right;font-weight:700;color:#2a1f14;">%s TND</td></tr>
                        </table>
                        %s
                        """.formatted(
                                escapeHtml(String.valueOf(vars.getOrDefault("sender", ""))),
                                vars.getOrDefault("amount", ""),
                                ctaBlock);
            }
            case "TRANSFER_REJECTED" -> {
                headline = "Transfer rejected";
                preheader = "Your PayZo transfer was not executed.";
                inner = """
                        <p style="margin:0 0 14px;">Transfer <strong style="font-family:'JetBrains Mono',monospace;">%s</strong> has been rejected and the amount returned to your balance.</p>
                        <div style="margin:18px 0;padding:14px 16px;background:#fbe1e1;border-radius:12px;border-left:4px solid #c93b3a;">
                          <div style="font-size:10px;font-weight:700;letter-spacing:1.4px;color:#8a2424;text-transform:uppercase;margin-bottom:6px;">Reason</div>
                          <div style="font-size:14px;color:#2a1f14;">%s</div>
                        </div>
                        """.formatted(vars.getOrDefault("reference", ""), vars.getOrDefault("reason", ""));
            }
            case "ACCOUNT_BLOCKED" -> {
                headline = "Account suspended";
                preheader = "Your PayZo account has been suspended.";
                inner = """
                        <p style="margin:0 0 14px;">Your PayZo account has been suspended and you can no longer sign in.</p>
                        <p style="margin:0;color:#8f857b;font-size:13px;">Please contact our support team to resolve the suspension.</p>
                        """;
            }
            case "ACCOUNT_UNBLOCKED" -> {
                headline = "Account reactivated";
                preheader = "Welcome back to PayZo.";
                inner = """
                        <p style="margin:0 0 14px;">Your PayZo account has been reactivated. You can sign in and use all services again.</p>
                        """;
            }
            case "BANK_DEACTIVATED" -> {
                headline = "Bank deactivated";
                preheader = "A bank you use on PayZo has been deactivated.";
                inner = """
                        <p style="margin:0 0 14px;"><strong>%s</strong> has been deactivated on PayZo. Any pending transfers involving this bank have been cancelled and refunded.</p>
                        """.formatted(vars.getOrDefault("bankName", ""));
            }
            default -> {
                headline = "Notification";
                preheader = "You have a new notification from PayZo.";
                inner = "<p style=\"margin:0;\">You have a new notification from PayZo.</p>";
            }
        }

        return wrapBrandedShell(headline, preheader, inner);
    }

    /**
     * Brand-coloured email shell — sits around every transactional template
     * so we get one consistent look across credentials, OTP, transfers, etc.
     * Inline CSS only because Gmail strips {@code <style>} tags.
     */
    private String wrapBrandedShell(String headline, String preheader, String innerHtml) {
        return """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width,initial-scale=1">
                </head>
                <body style="margin:0;padding:0;background:#f8f0e5;font-family:'Inter','Segoe UI',sans-serif;color:#2a1f14;">
                  <span style="display:none;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">%s</span>
                  <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:32px auto;max-width:560px;width:100%%;background:#ffffff;border-radius:20px;box-shadow:0 12px 32px -6px rgba(42,31,20,0.16);">
                    <tr>
                      <td style="padding:28px 32px 12px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%%;">
                          <tr>
                            <td style="vertical-align:middle;">
                              <span style="display:inline-block;padding:6px 12px;background:#2a1f14;color:#f8f0e5;font-weight:700;letter-spacing:1.5px;font-size:14px;border-radius:8px;">PayZo</span>
                            </td>
                            <td style="text-align:right;vertical-align:middle;font-size:11px;font-weight:700;letter-spacing:1.4px;color:#7a4a28;text-transform:uppercase;">
                              Easy · Intelligent · Trusted
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 32px 4px;">
                        <h1 style="margin:0;font-family:'Instrument Sans','Inter',sans-serif;font-size:24px;font-weight:700;color:#2a1f14;">%s</h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:12px 32px 28px;font-size:14px;line-height:22px;color:#2a1f14;">
                        %s
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:18px 32px 28px;border-top:1px solid #e2c7aa;font-size:11px;color:#8f857b;text-align:center;">
                        Sent automatically by PayZo · Tunisian digital banking · Faculté des Sciences de Monastir
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
                """.formatted(escapeHtml(preheader), escapeHtml(headline), innerHtml);
    }

    private static String escapeHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }
}
