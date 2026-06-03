package com.payzo.backend.config;

import io.netty.channel.ChannelOption;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;

/** Reactive WebClient used by {@code MlIntegrationService} to call the Python scorer, with config-driven connect and read timeouts. */
@Configuration
public class WebClientConfig {

    @Bean
    public WebClient mlWebClient(@Value("${ml.base-url}") String baseUrl,
                                 @Value("${ml.api-prefix}") String apiPrefix,
                                 @Value("${ml.connect-timeout-ms}") int connectTimeout,
                                 @Value("${ml.read-timeout-ms}") int readTimeout) {
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, connectTimeout)
                .responseTimeout(Duration.ofMillis(readTimeout));
        return WebClient.builder()
                .baseUrl(baseUrl + apiPrefix)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }
}
