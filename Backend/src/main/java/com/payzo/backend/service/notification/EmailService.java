package com.payzo.backend.service.notification;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;

/**
 * Sends emails via Spring's {@link JavaMailSender}. Uses MIME so we can
 * render HTML templates with the PayZo brand chrome — the body is treated
 * as already-rendered HTML by the caller (NotificationService).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;

    @Async
    public void send(String to, String subject, String htmlBody) {
        try {
            MimeMessage mime = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, false,
                    StandardCharsets.UTF_8.name());
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true); // true → HTML
            mailSender.send(mime);
            log.info("Email sent to {}: subject={}", to, subject);
        } catch (MessagingException e) {
            log.error("Failed to compose email to {}: {}", to, e.getMessage(), e);
            throw new RuntimeException(e);
        } catch (Exception e) {
            log.error("Failed to send email to {}: {}", to, e.getMessage(), e);
            throw e;
        }
    }
}
