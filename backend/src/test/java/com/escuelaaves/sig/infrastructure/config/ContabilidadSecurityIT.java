package com.escuelaaves.sig.infrastructure.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Contabilidad AP: solo roles autorizados (no basta autenticación genérica).
 */
@SpringBootTest
@AutoConfigureMockMvc
class ContabilidadSecurityIT {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @WithMockUser(username = "asesor", authorities = "ROLE_ASESOR")
    void asesorForbiddenOnContabilidad() throws Exception {
        mockMvc.perform(get("/api/v1/contabilidad/health"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "conta", authorities = "ROLE_CONTABILIDAD")
    void contabilidadAllowed() throws Exception {
        // 200 si el sidecar responde, o 502 si no está arriba — nunca 401/403.
        var result = mockMvc.perform(get("/api/v1/contabilidad/health")).andReturn();
        int code = result.getResponse().getStatus();
        org.junit.jupiter.api.Assertions.assertTrue(
                code == 200 || code == 502 || code == 503,
                "esperado 200/502/503, fue " + code
        );
    }

    @Test
    @WithMockUser(username = "comercial", authorities = "ROLE_COMERCIAL")
    void comercialForbidden() throws Exception {
        mockMvc.perform(get("/api/v1/contabilidad/dashboard"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "conta", authorities = "ROLE_CONTABILIDAD")
    void chatAskNoEs405() throws Exception {
        var result = mockMvc.perform(
                post("/api/v1/contabilidad/documents/ask")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"pregunta\":\"Resume cada factura\",\"document_ids\":null}")
        ).andReturn();
        int code = result.getResponse().getStatus();
        org.junit.jupiter.api.Assertions.assertNotEquals(405, code, "el chat contable no debe devolver Method Not Allowed");
        org.junit.jupiter.api.Assertions.assertTrue(
                code == 200 || code == 400 || code == 502 || code == 503,
                "esperado 200/400/502/503, fue " + code
        );
    }

    @Test
    @WithMockUser(username = "asesor", authorities = "ROLE_ASESOR")
    void asesorForbiddenOnChatAsk() throws Exception {
        mockMvc.perform(
                post("/api/v1/contabilidad/documents/ask")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"pregunta\":\"hola\",\"document_ids\":[]}")
        ).andExpect(status().isForbidden());
    }
}
