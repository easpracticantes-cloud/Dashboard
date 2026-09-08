package com.escuelaaves.sig.application.ai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiUserSafeMessagesTest {

    @Test
    void hidesSecretsAndSql() {
        assertTrue(AiUserSafeMessages.forUser("sk-ant-secret").contains("No pude completar"));
        assertTrue(AiUserSafeMessages.forUser("java.sql.SQLException: boom").contains("No pude completar"));
        assertEquals("Fila no encontrada", AiUserSafeMessages.forUser("Fila no encontrada"));
    }

    @Test
    void forLogStripsSecretsButKeepsTechnicalDetail() {
        assertTrue(AiUserSafeMessages.forLog("boom sk-ant-secret").contains("[omitido]"));
        assertTrue(AiUserSafeMessages.forLog("java.sql.SQLException: boom").contains("SQLException"));
    }
}
