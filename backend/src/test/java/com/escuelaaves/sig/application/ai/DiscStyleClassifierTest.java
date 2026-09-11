package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.domain.ai.model.DiscProfile;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DiscStyleClassifierTest {

    @Test
    void clasificaD() {
        DiscProfile p = DiscStyleClassifier.classify(List.of(
                "Precio?",
                "¿Hay cupo mañana?",
                "5 personas.",
                "Confírmame."
        ));
        assertEquals("D", p.disc());
        assertTrue(p.determined());
        assertTrue(p.confidence() >= DiscProfile.MIN_CONFIDENCE);
    }

    @Test
    void clasificaI() {
        DiscProfile p = DiscStyleClassifier.classify(List.of(
                "¡Hola! 😊",
                "Vi sus fotos y están increíbles!",
                "Quiero ir con mis amigos.",
                "¡Qué emoción!"
        ));
        assertEquals("I", p.disc());
        assertTrue(p.determined());
    }

    @Test
    void clasificaS() {
        DiscProfile p = DiscStyleClassifier.classify(List.of(
                "Buenos días.",
                "Muchas gracias por la información.",
                "Quisiera saber si el recorrido es tranquilo.",
                "Lo voy a revisar con mi familia."
        ));
        assertEquals("S", p.disc());
        assertTrue(p.determined());
    }

    @Test
    void clasificaC() {
        DiscProfile p = DiscStyleClassifier.classify(List.of(
                "Por favor envíeme la ficha técnica.",
                "¿Cuál es la duración exacta?",
                "¿Qué incluye el precio?",
                "¿Cuáles son las condiciones de cancelación?"
        ));
        assertEquals("C", p.disc());
        assertTrue(p.determined());
    }

    @Test
    void ambiguoHolaNoInventa() {
        DiscProfile p = DiscStyleClassifier.classify(List.of("Hola"));
        assertNull(p.disc());
        assertFalse(p.determined());
    }

    @Test
    void mixtoEmojiYFichaTecnicaGanaCConConfianzaAcotada() {
        DiscProfile p = DiscStyleClassifier.classifyProspectText(
                "Hola 😊 ¿me pueden enviar la ficha técnica, duración exacta, qué incluye el recorrido y las condiciones de cancelación?"
        );
        assertEquals("C", p.disc());
        assertTrue(p.determined());
        assertTrue(p.signals().stream().anyMatch(s -> s.contains("datos") || s.contains("precisión")));
        assertTrue(p.confidence() < 0.95);
    }

    @Test
    void mergeCoincidenteRefuerza() {
        DiscProfile a = DiscProfile.of("D", 0.7, "directo", List.of("urgencia"));
        DiscProfile b = DiscProfile.of("D", 0.8, "cierre", List.of("resultados"));
        DiscProfile m = DiscProfile.mergePreferringModel(a, b);
        assertEquals("D", m.disc());
        assertTrue(m.confidence() >= 0.8);
    }

    @Test
    void mergeEmpateBajaConfianza() {
        DiscProfile model = DiscProfile.of("D", 0.72, "rápido", List.of("urgencia"));
        DiscProfile local = DiscProfile.of("C", 0.71, "datos", List.of("precisión"));
        DiscProfile m = DiscProfile.mergePreferringModel(model, local);
        assertNotNull(m.disc());
        assertTrue(m.confidence() <= 0.72);
    }

    @Test
    void normalizaLetrasYRechazaNA() {
        assertEquals("D", DiscProfile.normalize("d"));
        assertEquals("D", DiscProfile.normalize("ROJO"));
        assertEquals("I", DiscProfile.normalize("AMARILLO"));
        assertEquals("S", DiscProfile.normalize("VERDE"));
        assertEquals("C", DiscProfile.normalize("AZUL"));
        assertEquals("C", DiscProfile.normalize("C"));
        assertNull(DiscProfile.normalize("N/A"));
        assertNull(DiscProfile.normalize(""));
    }
}
