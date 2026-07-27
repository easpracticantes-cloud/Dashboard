package com.escuelaaves.sig.infrastructure.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.context.annotation.Configuration;

@Configuration
@OpenAPIDefinition(
        info = @Info(
                title = "SIG - Sistema Inteligente de Gestion",
                version = "v1",
                description = "API REST del Sistema Inteligente de Gestion para Escuela Aves Salento. " +
                        "Incluye autenticacion, CRM de clientes, conversaciones (WhatsApp), notificaciones, " +
                        "reportes, configuracion del sistema y estado de integraciones.",
                contact = @Contact(name = "Escuela Aves Salento", email = "soporte@escuelaavessalento.com")
        ),
        security = @SecurityRequirement(name = "bearerAuth")
)
@SecurityScheme(
        name = "bearerAuth",
        type = SecuritySchemeType.HTTP,
        scheme = "bearer",
        bearerFormat = "JWT"
)
public class OpenApiConfig {
}
