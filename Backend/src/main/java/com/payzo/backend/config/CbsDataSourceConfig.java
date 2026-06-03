package com.payzo.backend.config;

import jakarta.persistence.EntityManagerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.orm.jpa.EntityManagerFactoryBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;
import java.util.HashMap;
import java.util.Map;

/**
 * Direct JPA access to cbs_db (D2) — replaces the WebClient REST hop.
 * cbs-simulator owns the schema in dev (ddl-auto=create on startup); payzo-backend
 * reads/writes via this datasource with ddl-auto=validate so schema drift fails fast.
 */
@Configuration
@EnableJpaRepositories(
        basePackages = "com.payzo.backend.cbs.repository",
        entityManagerFactoryRef = "cbsEntityManagerFactory",
        transactionManagerRef = "cbsTransactionManager"
)
public class CbsDataSourceConfig {

    @Bean
    @ConfigurationProperties("cbs.datasource")
    public DataSourceProperties cbsDataSourceProperties() {
        return new DataSourceProperties();
    }

    @Bean
    public DataSource cbsDataSource(@Qualifier("cbsDataSourceProperties") DataSourceProperties props) {
        return props.initializeDataSourceBuilder().build();
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean cbsEntityManagerFactory(
            EntityManagerFactoryBuilder builder,
            @Qualifier("cbsDataSource") DataSource dataSource) {

        Map<String, Object> props = new HashMap<>();
        props.put("hibernate.dialect", "org.hibernate.dialect.PostgreSQLDialect");
        // Always validate — cbs-simulator owns schema lifecycle.
        props.put("hibernate.hbm2ddl.auto", "validate");
        props.put("hibernate.format_sql", "true");
        // cbs-simulator creates columns in snake_case (auto-configured Spring Boot).
        // Custom EMFs don't inherit Spring Boot's naming strategy automatically — we
        // have to set it explicitly here, otherwise validation looks for
        // 'accountNumber' instead of 'account_number' and fails.
        props.put("hibernate.physical_naming_strategy",
                "org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy");

        return builder
                .dataSource(dataSource)
                .packages("com.payzo.backend.cbs.entity")
                .persistenceUnit("cbs")
                .properties(props)
                .build();
    }

    @Bean
    public PlatformTransactionManager cbsTransactionManager(
            @Qualifier("cbsEntityManagerFactory") EntityManagerFactory emf) {
        return new JpaTransactionManager(emf);
    }
}
