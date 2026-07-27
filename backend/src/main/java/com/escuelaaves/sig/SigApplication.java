package com.escuelaaves.sig;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Punto de entrada del backend SIG (Sistema Inteligente de Gestion) para
 * Escuela Aves Salento.
 */
@SpringBootApplication
@EnableScheduling
public class SigApplication {

    public static void main(String[] args) {
        SpringApplication.run(SigApplication.class, args);
    }
}
