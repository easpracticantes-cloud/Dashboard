package com.escuelaaves.sig.application.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DiscReplyStyleTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void leeDiscDelContextoDeRegistro() throws Exception {
        String json = "{\"module\":\"Registro\",\"allowedContext\":{\"disc\":\"S\",\"cliente\":\"Ana\"}}";
        assertEquals("S", DiscReplyStyle.fromUiContext(json, mapper));
        assertTrue(DiscReplyStyle.systemAppendix("S").contains("tranquilo"));
    }

    @Test
    void ignoraDiscInvalido() {
        assertNull(DiscReplyStyle.fromUiContext("{\"allowedContext\":{\"disc\":\"N/A\"}}", mapper));
        assertEquals("", DiscReplyStyle.systemAppendix("N/A"));
    }
}
