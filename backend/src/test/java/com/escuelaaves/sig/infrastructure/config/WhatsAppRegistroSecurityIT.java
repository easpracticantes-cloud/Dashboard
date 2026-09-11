package com.escuelaaves.sig.infrastructure.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class WhatsAppRegistroSecurityIT {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void anonimoNoPuedeAnalizar() throws Exception {
        mockMvc.perform(post("/api/v1/registro/whatsapp/analyze"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "comercial", authorities = "ROLE_COMERCIAL")
    void autenticadoRechazaArchivoVacio() throws Exception {
        MockMultipartFile empty = new MockMultipartFile("file", "vacio.txt", "text/plain", new byte[0]);
        mockMvc.perform(multipart("/api/v1/registro/whatsapp/analyze").file(empty))
                .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser(username = "comercial", authorities = "ROLE_COMERCIAL")
    void autenticadoRechazaLoteVacioEnFiles() throws Exception {
        MockMultipartFile empty = new MockMultipartFile("files", "vacio.txt", "text/plain", new byte[0]);
        mockMvc.perform(multipart("/api/v1/registro/whatsapp/analyze").file(empty))
                .andExpect(status().isBadRequest());
    }

    @Test
    void anonimoNoPuedeConfirmarLote() throws Exception {
        mockMvc.perform(post("/api/v1/registro/whatsapp/confirm-batch")
                        .contentType("application/json")
                        .content("{\"items\":[]}"))
                .andExpect(status().isUnauthorized());
    }
}
