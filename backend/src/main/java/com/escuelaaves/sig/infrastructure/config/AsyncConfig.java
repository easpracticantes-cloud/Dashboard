package com.escuelaaves.sig.infrastructure.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

@Configuration
@EnableAsync
public class AsyncConfig {

    @Bean(name = "sheetsSyncExecutor")
    public Executor sheetsSyncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        // Un worker de persistencia a la vez (evita conflictos de UPSERT), cola amplia
        // para heal/refresh/manual sin descartar tareas.
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(32);
        executor.setThreadNamePrefix("sheets-sync-");
        executor.initialize();
        return executor;
    }
}
