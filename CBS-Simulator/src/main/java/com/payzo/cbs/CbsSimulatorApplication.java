package com.payzo.cbs;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Bootstraps the CBS simulator on port 8082. Independent Spring Boot module
 * (com.payzo.cbs package, separate from com.payzo.backend) so the simulator
 * can be swapped for a real core banking system without code changes on the
 * PayZo side. Postgres datasource (cbs_db) on the same instance as payzo_db.
 */
@SpringBootApplication
public class CbsSimulatorApplication {

    public static void main(String[] args) {
        SpringApplication.run(CbsSimulatorApplication.class, args);
    }
}
