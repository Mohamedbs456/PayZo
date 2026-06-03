package com.payzo.backend.service.notification;

import com.vonage.client.VonageClient;
import com.vonage.client.sms.MessageStatus;
import com.vonage.client.sms.SmsSubmissionResponse;
import com.vonage.client.sms.messages.TextMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/** Async Vonage SMS sender that throws on Vonage error codes so {@link NotificationService}'s retry scheduler can pick the row back up. */
@Service
@Slf4j
public class SmsService {

    private final VonageClient vonageClient;
    private final String from;

    public SmsService(@Value("${vonage.api-key}") String apiKey,
                      @Value("${vonage.api-secret}") String apiSecret,
                      @Value("${vonage.from}") String from) {
        this.vonageClient = VonageClient.builder()
                .apiKey(apiKey)
                .apiSecret(apiSecret)
                .build();
        this.from = from;
    }

    @Async
    public void send(String to, String text) {
        try {
            TextMessage message = new TextMessage(from, to, text);
            SmsSubmissionResponse response = vonageClient.getSmsClient().submitMessage(message);

            if (response.getMessages().get(0).getStatus() == MessageStatus.OK) {
                log.info("SMS sent to {}", to);
            } else {
                String errorText = response.getMessages().get(0).getErrorText();
                log.error("SMS failed to {}: {}", to, errorText);
                throw new RuntimeException("SMS send failed: " + errorText);
            }
        } catch (Exception e) {
            log.error("Failed to send SMS to {}: {}", to, e.getMessage(), e);
            throw e;
        }
    }
}
