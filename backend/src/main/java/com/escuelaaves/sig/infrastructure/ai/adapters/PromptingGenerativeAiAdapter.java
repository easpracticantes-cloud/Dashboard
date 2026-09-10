package com.escuelaaves.sig.infrastructure.ai.adapters;

import com.escuelaaves.sig.application.ai.CommercialCatalogService;
import com.escuelaaves.sig.application.ai.ContextRetriever;
import com.escuelaaves.sig.domain.ai.model.ConversationClassification;
import com.escuelaaves.sig.domain.ai.model.LanguageDetection;
import com.escuelaaves.sig.domain.ai.model.NaturalLanguageQuotation;
import com.escuelaaves.sig.domain.ai.model.PricedQuotation;
import com.escuelaaves.sig.domain.ai.model.QuoteInterpretation;
import com.escuelaaves.sig.domain.ai.model.ReservationExtraction;
import com.escuelaaves.sig.domain.ai.model.SeguimientoExtraction;
import com.escuelaaves.sig.domain.ai.model.SentimentAnalysis;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.infrastructure.ai.support.AiStructuredJson;
import com.escuelaaves.sig.infrastructure.ai.support.PromptAssembly;
import com.escuelaaves.sig.infrastructure.ai.support.StructuredOutputValidator;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;

import java.util.List;

/**
 * Prompts y parseo compartidos del proveedor Claude.
 * Cada proveedor solo implementa {@link #generateText}.
 */
@Slf4j
public abstract class PromptingGenerativeAiAdapter implements GenerativeAiPort {

    protected final ObjectMapper objectMapper;
    protected final CommercialCatalogService commercialCatalog;
    protected final ContextRetriever contextRetriever;

    protected PromptingGenerativeAiAdapter(
            ObjectMapper objectMapper,
            CommercialCatalogService commercialCatalog,
            ContextRetriever contextRetriever
    ) {
        this.objectMapper = objectMapper;
        this.commercialCatalog = commercialCatalog;
        this.contextRetriever = contextRetriever;
    }

    /**
     * @param operation nombre lógico para routing de modelo / observabilidad (chat, interpretQuote, …)
     */
    protected abstract String generateText(String systemPrompt, String userMessage, boolean jsonMode, String operation);

    @Override
    public String chat(String systemPrompt, String userMessage) {
        return generateText(systemPrompt, userMessage, false, "chat");
    }

    @Override
    public String chat(String systemPrompt, String userMessage, String operation) {
        String op = (operation == null || operation.isBlank()) ? "chat" : operation;
        return generateText(systemPrompt, userMessage, false, op);
    }

    @Override
    public QuoteInterpretation interpretQuote(String message) {
        String catalogIndex = contextRetriever.buildCompactContext(message, null, 8, 3, true);
        String system = """
                Eres un extractor de datos para Escuela Aves Salento (tours en Quindío, Colombia).
                Devuelve SOLO JSON válido con estas claves:
                tour (string: usa el CODE exacto del catálogo cuando puedas; ej TREKKING_EN_RN_ACAIME, ACAIME, RAFTING_EN_EL_EJE_CAFETERO),
                people (integer),
                date (YYYY-MM-DD o null si no hay fecha clara; si dice "sábado" estima la próxima fecha relativa a hoy),
                pickup (ciudad de recogida o null),
                transport (boolean),
                restaurant (boolean; true si mencionan almuerzo/comida/restaurante),
                rawNotes (string breve; indica PRIVADO o COMPARTIDO si el cliente lo dice).
                No inventes precios. No calcules montos. No agregues texto fuera del JSON.

                Catálogo de referencia (elige el code más cercano):
                """ + catalogIndex;
        String user = PromptAssembly.fenceUntrusted("Mensaje del cliente:", message);
        String json = generateText(system, user, true, "interpretQuote");
        var validated = StructuredOutputValidator.parseObject(objectMapper, json, "tour");
        if (!validated.valid()) {
            String retry = generateText(system + "\n" + validated.retryHint(), user, true, "interpretQuote");
            return parseQuoteInterpretation(retry, message);
        }
        return parseQuoteInterpretation(json, message);
    }

    @Override
    public String summarizeConversation(String conversationText) {
        return generateText(
                "Resume en español, en 2-4 frases, esta conversación comercial de WhatsApp para un asesor.",
                conversationText,
                false,
                "summarize"
        );
    }

    @Override
    public ConversationClassification classifyConversation(String conversationText) {
        String system = """
                Clasifica la conversación. Devuelve SOLO JSON:
                {"category":"...","intent":"...","urgency":"LOW|MEDIUM|HIGH","rationale":"..."}
                """;
        String json = generateText(system, conversationText, true, "classify");
        try {
            JsonNode node = objectMapper.readTree(AiStructuredJson.extractJson(json));
            return new ConversationClassification(
                    AiStructuredJson.text(node, "category"),
                    AiStructuredJson.text(node, "intent"),
                    AiStructuredJson.text(node, "urgency"),
                    AiStructuredJson.text(node, "rationale")
            );
        } catch (Exception ex) {
            log.warn("No se pudo parsear clasificación: {}", ex.getMessage());
            return new ConversationClassification("UNKNOWN", "UNKNOWN", "MEDIUM", json);
        }
    }

    @Override
    public String generateEmail(String context) {
        return generateText(
                "Redacta un correo profesional en español para Escuela Aves Salento. Solo el cuerpo del correo.",
                context,
                false,
                "generateEmail"
        );
    }

    @Override
    public NaturalLanguageQuotation generateQuotationNarrative(PricedQuotation priced) {
        String system = """
                Genera SOLO JSON:
                {"emailSubject":"...","emailBody":"...","quotationText":"..."}
                Usa los montos dados; no los cambies. Tono cálido y profesional. Español.
                """;
        String user = """
                Tour: %s (%s)
                Personas: %s
                Fecha: %s
                Pickup: %s
                Transporte: %s
                Restaurante: %s
                Precio/persona tour: %s
                Subtotal tour: %s
                Subtotal transporte: %s
                Subtotal restaurante: %s
                TOTAL: %s %s
                """.formatted(
                priced.tourName(), priced.tourCode(),
                priced.interpretation().people(),
                priced.interpretation().date(),
                priced.interpretation().pickup(),
                priced.interpretation().transport(),
                priced.interpretation().restaurant(),
                priced.pricePerPerson(),
                priced.subtotalTour(),
                priced.subtotalTransport(),
                priced.subtotalRestaurant(),
                priced.total(),
                priced.currency()
        );
        String json = generateText(system, user, true, "quotationNarrative");
        try {
            JsonNode node = objectMapper.readTree(AiStructuredJson.extractJson(json));
            return new NaturalLanguageQuotation(
                    AiStructuredJson.text(node, "emailSubject"),
                    AiStructuredJson.text(node, "emailBody"),
                    AiStructuredJson.text(node, "quotationText")
            );
        } catch (Exception ex) {
            log.warn("No se pudo parsear narrativa de cotización: {}", ex.getMessage());
            return new NaturalLanguageQuotation(
                    "Cotización Escuela Aves Salento",
                    json,
                    json
            );
        }
    }

    @Override
    public ReservationExtraction extractReservationInformation(String message) {
        String system = """
                Extrae reserva. SOLO JSON:
                {"tour":"...","people":N,"date":"YYYY-MM-DD|null","pickup":"...","notes":"..."}
                """;
        String json = generateText(system, message, true, "extractReservation");
        try {
            JsonNode node = objectMapper.readTree(AiStructuredJson.extractJson(json));
            return new ReservationExtraction(
                    AiStructuredJson.text(node, "tour"),
                    AiStructuredJson.intOrNull(node, "people"),
                    AiStructuredJson.textOrNull(node, "date"),
                    AiStructuredJson.textOrNull(node, "pickup"),
                    AiStructuredJson.textOrNull(node, "notes")
            );
        } catch (Exception ex) {
            throw new BadRequestException("No se pudo extraer información de reserva: " + ex.getMessage());
        }
    }

    @Override
    public SeguimientoExtraction extractSeguimientoFromChat(String normalizedChat) {
        String system = """
                Eres extractor de Escuela Aves Salento. Analiza TODO el chat cronológico.
                Devuelve SOLO JSON con esta forma:
                {
                  "campos": {
                    "fecha": {"valor":"YYYY-MM-DD o null","estado":"CONFIRMADO|INFERIDO|AMBIGUO|NO_ENCONTRADO","confianza":0.0},
                    "tipo": {"valor":"B2B|B2C|AGENCIA|PARTICULAR o null","estado":"...","confianza":0.0},
                    "canal": {"valor":"WHATSAPP","estado":"CONFIRMADO","confianza":1},
                    "cliente": {"valor":null,"estado":"...","confianza":0.0},
                    "celular": {"valor":null,"estado":"...","confianza":0.0},
                    "disc": {"valor":"N/A","estado":"...","confianza":0.0},
                    "solicitud": {"valor":null,"estado":"...","confianza":0.0},
                    "respuesta": {"valor":null,"estado":"...","confianza":0.0},
                    "semaforo": {"valor":"FRIO|TIBIO|CALIENTE|VENTA o null","estado":"...","confianza":0.0},
                    "fechaCotizado": {"valor":"YYYY-MM-DD o null","estado":"...","confianza":0.0},
                    "notas": {"valor":null,"estado":"...","confianza":0.0},
                    "proximoSeguimiento": {"valor":"YYYY-MM-DD o null","estado":"...","confianza":0.0},
                    "priorizar": {"valor":"ALTA|MEDIA|BAJA o null","estado":"...","confianza":0.0},
                    "pendiente": {"valor":null,"estado":"...","confianza":0.0},
                    "asignado": {"valor":null,"estado":"...","confianza":0.0},
                    "fechaServicio": {"valor":"YYYY-MM-DD o null","estado":"...","confianza":0.0},
                    "registrado": {"valor":"WHATSAPP","estado":"CONFIRMADO","confianza":1},
                    "objecion": {"valor":null,"estado":"...","confianza":0.0},
                    "encuesta": {"valor":"SI|NO|PENDIENTE o null","estado":"...","confianza":0.0}
                  },
                  "ultimaCotizacion": {
                    "fecha":"YYYY-MM-DD o null",
                    "servicio":null,
                    "valor":null,
                    "estado":"aceptada|rechazada|pendiente|modificada|NO_IDENTIFICADO",
                    "condiciones":null,
                    "respuestaCliente":null
                  },
                  "historialCotizaciones": [],
                  "posibleDuplicado": null,
                  "resumen": "texto breve"
                }
                La última cotización NO es el último mensaje: es la última versión de precio/servicio enviada.
                No inventes. Si no aparece, valor null y estado NO_ENCONTRADO.
                """;
        String user = PromptAssembly.fenceUntrusted("Chat de WhatsApp (cronológico):", normalizedChat);
        String json = generateText(system, user, true, "extractSeguimiento");
        try {
            JsonNode node = objectMapper.readTree(AiStructuredJson.extractJson(json));
            return parseSeguimiento(node);
        } catch (Exception ex) {
            throw new BadRequestException("No se pudo estructurar el chat de WhatsApp.");
        }
    }

    private SeguimientoExtraction parseSeguimiento(JsonNode node) {
        java.util.LinkedHashMap<String, SeguimientoExtraction.FieldValue> campos = new java.util.LinkedHashMap<>();
        JsonNode rawCampos = node.path("campos");
        String[] keys = {
                "fecha", "tipo", "canal", "cliente", "celular", "disc", "solicitud", "respuesta",
                "semaforo", "fechaCotizado", "notas", "proximoSeguimiento", "priorizar", "pendiente",
                "asignado", "fechaServicio", "registrado", "objecion", "encuesta"
        };
        for (String key : keys) {
            JsonNode fv = rawCampos.path(key);
            campos.put(key, new SeguimientoExtraction.FieldValue(
                    AiStructuredJson.textOrNull(fv, "valor"),
                    OptionalEstado(AiStructuredJson.textOrNull(fv, "estado")),
                    fv.path("confianza").isNumber() ? fv.path("confianza").asDouble() : 0
            ));
        }
        if (campos.get("canal").valor() == null) {
            campos.put("canal", SeguimientoExtraction.FieldValue.of("WHATSAPP", "CONFIRMADO", 1));
        }
        if (campos.get("registrado").valor() == null) {
            campos.put("registrado", SeguimientoExtraction.FieldValue.of("WHATSAPP", "CONFIRMADO", 1));
        }
        JsonNode u = node.path("ultimaCotizacion");
        SeguimientoExtraction.UltimaCotizacion ultima = new SeguimientoExtraction.UltimaCotizacion(
                AiStructuredJson.textOrNull(u, "fecha"),
                AiStructuredJson.textOrNull(u, "servicio"),
                AiStructuredJson.textOrNull(u, "valor"),
                AiStructuredJson.textOrNull(u, "estado"),
                AiStructuredJson.textOrNull(u, "condiciones"),
                AiStructuredJson.textOrNull(u, "respuestaCliente")
        );
        java.util.ArrayList<SeguimientoExtraction.UltimaCotizacion> hist = new java.util.ArrayList<>();
        if (node.path("historialCotizaciones").isArray()) {
            for (JsonNode h : node.path("historialCotizaciones")) {
                hist.add(new SeguimientoExtraction.UltimaCotizacion(
                        AiStructuredJson.textOrNull(h, "fecha"),
                        AiStructuredJson.textOrNull(h, "servicio"),
                        AiStructuredJson.textOrNull(h, "valor"),
                        AiStructuredJson.textOrNull(h, "estado"),
                        AiStructuredJson.textOrNull(h, "condiciones"),
                        AiStructuredJson.textOrNull(h, "respuestaCliente")
                ));
            }
        }
        return new SeguimientoExtraction(
                campos,
                ultima,
                List.copyOf(hist),
                AiStructuredJson.textOrNull(node, "posibleDuplicado"),
                AiStructuredJson.textOrNull(node, "resumen")
        );
    }

    private static String OptionalEstado(String estado) {
        if (estado == null || estado.isBlank()) {
            return "NO_ENCONTRADO";
        }
        return estado.trim().toUpperCase();
    }

    @Override
    public LanguageDetection detectLanguage(String text) {
        String system = """
                Detecta el idioma. SOLO JSON:
                {"languageCode":"es","languageName":"Spanish","confidence":0.0}
                """;
        String json = generateText(system, text, true, "detectLanguage");
        try {
            JsonNode node = objectMapper.readTree(AiStructuredJson.extractJson(json));
            return new LanguageDetection(
                    AiStructuredJson.text(node, "languageCode"),
                    AiStructuredJson.text(node, "languageName"),
                    node.path("confidence").asDouble(0.5)
            );
        } catch (Exception ex) {
            return new LanguageDetection("und", "Unknown", 0.0);
        }
    }

    @Override
    public SentimentAnalysis analyzeSentiment(String text) {
        String system = """
                Analiza sentimiento comercial. SOLO JSON:
                {"sentiment":"POSITIVE|NEUTRAL|NEGATIVE","score":0.0,"intent":"...","urgency":"LOW|MEDIUM|HIGH"}
                """;
        String json = generateText(system, text, true, "analyzeSentiment");
        try {
            JsonNode node = objectMapper.readTree(AiStructuredJson.extractJson(json));
            return new SentimentAnalysis(
                    AiStructuredJson.text(node, "sentiment"),
                    node.path("score").asDouble(0.0),
                    AiStructuredJson.text(node, "intent"),
                    AiStructuredJson.text(node, "urgency")
            );
        } catch (Exception ex) {
            return new SentimentAnalysis("NEUTRAL", 0.0, "UNKNOWN", "MEDIUM");
        }
    }

    @Override
    public String suggestReply(String conversationText) {
        return generateText(
                "Sugiere UNA respuesta breve, cálida y profesional de WhatsApp para el asesor de Escuela Aves Salento. Solo el texto.",
                conversationText,
                false,
                "suggestReply"
        );
    }

    private QuoteInterpretation parseQuoteInterpretation(String json, String original) {
        try {
            JsonNode node = objectMapper.readTree(AiStructuredJson.extractJson(json));
            return new QuoteInterpretation(
                    AiStructuredJson.upperOrNull(AiStructuredJson.textOrNull(node, "tour")),
                    AiStructuredJson.intOrNull(node, "people"),
                    AiStructuredJson.textOrNull(node, "date"),
                    AiStructuredJson.textOrNull(node, "pickup"),
                    AiStructuredJson.boolOrNull(node, "transport"),
                    AiStructuredJson.boolOrNull(node, "restaurant"),
                    AiStructuredJson.textOrNull(node, "rawNotes") != null
                            ? AiStructuredJson.textOrNull(node, "rawNotes")
                            : original
            );
        } catch (Exception ex) {
            throw new BadRequestException("No se pudo interpretar la cotización: " + ex.getMessage());
        }
    }
}
