package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.application.ai.InstructionQuoteExtractor.ExtractedService;
import com.escuelaaves.sig.application.ai.InstructionQuoteExtractor.ExtractionResult;
import com.escuelaaves.sig.application.ai.InstructionQuoteExtractor.MissingItem;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuoteDraftDto;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuoteLineItemDto;
import com.escuelaaves.sig.application.dto.ai.IntelligentQuoteDtos.ApproveIntelligentQuoteRequest;
import com.escuelaaves.sig.application.dto.ai.IntelligentQuoteDtos.ApproveIntelligentQuoteResponse;
import com.escuelaaves.sig.application.dto.ai.IntelligentQuoteDtos.CatalogMatchOption;
import com.escuelaaves.sig.application.dto.ai.IntelligentQuoteDtos.CreateIntelligentQuoteRequest;
import com.escuelaaves.sig.application.dto.ai.IntelligentQuoteDtos.FieldTrace;
import com.escuelaaves.sig.application.dto.ai.IntelligentQuoteDtos.IntelligentQuoteResponse;
import com.escuelaaves.sig.application.dto.ai.IntelligentQuoteDtos.MissingInfo;
import com.escuelaaves.sig.application.dto.commercial.QuoteCreateRequest;
import com.escuelaaves.sig.application.dto.commercial.QuoteDto;
import com.escuelaaves.sig.application.service.CommercialService;
import com.escuelaaves.sig.domain.model.CommercialStatus;
import com.escuelaaves.sig.domain.port.out.ClientRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.ClientEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.IntelligentQuoteEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.IntelligentQuoteJpaRepository;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.escuelaaves.sig.shared.exception.ResourceNotFoundException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.HtmlUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

/**
 * Cotización inteligente: instrucción del asesor → Claude → catálogo SIG → cálculos.
 * Sin dependencia de WhatsApp.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class IntelligentQuoteOrchestrator {

    private static final String DEFAULT_CONDITIONS = String.join("\n",
            "Forma de pago: 50% a la reserva y 50% el día del tour.",
            "Transferencia bancaria, Nequi o Daviplata.",
            "Cancelación: mínimo 48 horas de anticipación.",
            "Por condiciones climáticas se reprograma; no se reembolsa el valor.");

    private final InstructionQuoteExtractor extractor;
    private final CatalogQuoteService catalogQuoteService;
    private final QuoteDocumentCalculator calculator;
    private final IntelligentQuoteJpaRepository intelligentQuoteJpaRepository;
    private final ClientRepositoryPort clientRepositoryPort;
    private final CommercialService commercialService;
    private final ObjectMapper objectMapper;

    @Transactional
    public IntelligentQuoteResponse create(CreateIntelligentQuoteRequest request) {
        if (request == null || request.instructions() == null || request.instructions().isBlank()) {
            throw new BadRequestException("Escribe qué deseas cotizar.");
        }

        Map<String, String> clientCtx = new LinkedHashMap<>();
        ClientEntity client = null;
        if (request.clientId() != null) {
            client = clientRepositoryPort.findById(request.clientId())
                    .orElseThrow(() -> new ResourceNotFoundException("Cliente no encontrado"));
            put(clientCtx, "name", client.getName());
            put(clientCtx, "phone", client.getPhone());
            put(clientCtx, "email", client.getEmail());
        }
        put(clientCtx, "name", request.clientNameOverride());
        put(clientCtx, "document", request.clientDocumentOverride());
        put(clientCtx, "phone", request.clientPhoneOverride());
        put(clientCtx, "email", request.clientEmailOverride());
        put(clientCtx, "city", request.clientCityOverride());
        put(clientCtx, "address", request.clientAddressOverride());

        ExtractionResult extraction = extractor.extract(request.instructions(), clientCtx);
        List<MissingInfo> missing = new ArrayList<>();
        List<String> warnings = new ArrayList<>(extraction.warnings());
        List<FieldTrace> trace = new ArrayList<>();
        List<CatalogMatchOption> alternatives = new ArrayList<>();

        List<QuoteLineItemDto> lines = new ArrayList<>();
        String modality = null;
        String includes = null;
        String excludes = null;
        boolean reviewFlag = false;
        String productCode = null;
        String productName = null;
        Integer people = null;
        Map<String, BigDecimal> scale = null;

        List<ExtractedService> services = new ArrayList<>(extraction.services());
        if (request.preferredServiceHints() != null) {
            for (String hint : request.preferredServiceHints()) {
                if (hint != null && !hint.isBlank()) {
                    services.add(0, new ExtractedService(hint, null, people, "pax", hint, "HIGH", "Hint del asesor"));
                }
            }
        }

        for (ExtractedService svc : services) {
            int qty = svc.quantity() != null && svc.quantity() > 0 ? svc.quantity() : 0;
            if (qty > 0) {
                people = qty;
            }
            String hint = firstNonBlank(svc.serviceHint(), svc.name(), "avistamiento");
            String query = hint + (qty > 0 ? " para " + qty + " personas" : "");
            var priced = catalogQuoteService.tryQuote(query);
            if (priced.isPresent()) {
                var q = priced.get();
                String desc = sanitizeText(firstNonBlank(svc.description(), q.name()));
                QuoteLineItemDto line = new QuoteLineItemDto(
                        desc,
                        qty > 0 ? qty : q.people(),
                        svc.unit() != null ? svc.unit() : "pax",
                        q.unitPrice(),
                        BigDecimal.ZERO,
                        null,
                        null
                );
                lines.add(line);
                modality = q.modality();
                includes = q.includes();
                excludes = q.excludes();
                reviewFlag = q.reviewFlag();
                productCode = q.code();
                productName = q.name();
                scale = q.priceScaleByPax();
                people = line.quantity();
                alternatives.add(new CatalogMatchOption(q.code(), q.name(), q.modality(), q.unitPrice(), line.quantity()));
                trace.add(new FieldTrace("service." + q.code(), "CATALOG", svc.confidence(), "Tarifa catálogo SIG"));
                trace.add(new FieldTrace("unitPrice." + q.code(), "CATALOG", "HIGH", "Precio del catálogo; no Claude"));
            } else {
                String desc = sanitizeText(firstNonBlank(svc.description(), svc.name(), "Servicio por confirmar"));
                lines.add(new QuoteLineItemDto(
                        desc,
                        qty > 0 ? qty : 1,
                        svc.unit() != null ? svc.unit() : "pax",
                        BigDecimal.ZERO,
                        BigDecimal.ZERO,
                        null,
                        BigDecimal.ZERO
                ));
                missing.add(new MissingInfo(
                        "tarifa",
                        "CRITICAL",
                        "El servicio fue identificado, pero no tiene una tarifa configurada en SIG."
                ));
                warnings.add("Sin tarifa de catálogo para: " + hint);
                trace.add(new FieldTrace("service." + hint, "AI",
                        svc.confidence() != null ? svc.confidence() : "LOW", svc.evidence()));
            }
        }

        for (MissingItem m : extraction.missingInformation()) {
            missing.add(new MissingInfo(m.field(), m.severity(), m.message()));
        }

        String clientName = firstNonBlank(
                request.clientNameOverride(),
                client != null ? client.getName() : null,
                extraction.client().get("name")
        );
        String clientPhone = firstNonBlank(
                request.clientPhoneOverride(),
                client != null ? client.getPhone() : null,
                extraction.client().get("phone")
        );
        String clientEmail = firstNonBlank(
                request.clientEmailOverride(),
                client != null ? client.getEmail() : null,
                extraction.client().get("email")
        );
        String clientCity = firstNonBlank(request.clientCityOverride(), extraction.client().get("city"));
        String clientNit = firstNonBlank(request.clientDocumentOverride(), extraction.client().get("document"));
        String clientAddress = firstNonBlank(request.clientAddressOverride(), extraction.client().get("address"));

        if (clientName == null || clientName.isBlank()) {
            missing.add(new MissingInfo("cliente", "IMPORTANT", "Selecciona o indica el nombre del cliente."));
        } else {
            trace.add(new FieldTrace("client.name",
                    client != null ? "CLIENT" : "USER",
                    "HIGH",
                    "Datos de cliente SIG o captura manual"));
        }

        String conditions = firstNonBlank(
                extraction.commercialConditions().get("paymentTerms"),
                DEFAULT_CONDITIONS
        );
        String notes = extraction.notes().isEmpty()
                ? extraction.requestSummary()
                : String.join("\n", extraction.notes().stream().map(this::sanitizeText).toList());

        String provisionalCode = nextQuoteCode();
        String issued = LocalDate.now().toString();
        String validUntil = firstNonBlank(request.validUntil(), LocalDate.now().plusDays(15).toString());
        String serviceDate = firstNonBlank(request.serviceDate(), extraction.requestedDate(), issued);

        QuoteDraftDto raw = new QuoteDraftDto(
                productCode,
                firstNonBlank(productName, lines.isEmpty() ? "Cotización" : lines.get(0).description()),
                modality,
                people,
                lines.isEmpty() ? BigDecimal.ZERO : lines.get(0).unitPrice(),
                null,
                extraction.currency() != null ? extraction.currency() : "COP",
                serviceDate,
                null,
                sanitizeText(clientName),
                sanitizeText(notes),
                includes,
                excludes,
                reviewFlag,
                scale,
                lines,
                sanitizeText(clientNit),
                sanitizeText(clientPhone),
                sanitizeText(clientEmail),
                sanitizeText(clientCity),
                null,
                sanitizeText(clientAddress),
                sanitizeText(request.advisorName()),
                provisionalCode,
                issued,
                validUntil,
                sanitizeText(notes),
                conditions,
                "DRAFT"
        );
        QuoteDraftDto document = calculator.normalize(raw);
        trace.add(new FieldTrace("totals", "SYSTEM", "HIGH", "Totales QuoteDocumentCalculator"));
        trace.add(new FieldTrace("quoteNumber", "SYSTEM", "HIGH", "Consecutivo provisional: " + provisionalCode));

        IntelligentQuoteEntity entity = IntelligentQuoteEntity.builder()
                .id(UUID.randomUUID())
                .status("PREVIEW")
                .quoteCode(provisionalCode)
                .clientId(request.clientId())
                .clientName(document.clientName())
                .confidence(extraction.confidence())
                .instructions(request.instructions().strip())
                .extractionJson(writeJson(extraction))
                .draftJson(writeJson(document))
                .missingJson(writeJson(missing))
                .warningsJson(writeJson(warnings))
                .traceJson(writeJson(trace))
                .build();
        intelligentQuoteJpaRepository.save(entity);

        return new IntelligentQuoteResponse(
                entity.getId(),
                entity.getStatus(),
                document,
                missing,
                warnings,
                extraction.confidence(),
                trace,
                alternatives,
                "LISTA PARA REVISAR"
        );
    }

    @Transactional(readOnly = true)
    public IntelligentQuoteResponse get(UUID id) {
        return toResponse(load(id), "LISTA PARA REVISAR");
    }

    @Transactional
    public IntelligentQuoteResponse recalculate(UUID id, QuoteDraftDto edited) {
        IntelligentQuoteEntity entity = load(id);
        QuoteDraftDto normalized = calculator.normalize(stripHtml(edited));
        entity.setDraftJson(writeJson(normalized));
        entity.setStatus("PREVIEW");
        entity.setClientName(normalized.clientName());
        intelligentQuoteJpaRepository.save(entity);
        return toResponse(entity, "CALCULANDO");
    }

    @Transactional
    public ApproveIntelligentQuoteResponse approve(UUID id, ApproveIntelligentQuoteRequest request) {
        IntelligentQuoteEntity entity = load(id);
        QuoteDraftDto incoming = request != null && request.document() != null
                ? request.document()
                : readDraft(entity.getDraftJson());
        QuoteDraftDto normalized = calculator.normalize(stripHtml(incoming));
        List<String> errors = calculator.validateForSave(normalized);
        List<MissingInfo> critical = readMissing(entity.getMissingJson()).stream()
                .filter(m -> "CRITICAL".equalsIgnoreCase(m.severity()))
                .filter(m -> stillCritical(m, normalized))
                .toList();
        if (!critical.isEmpty()) {
            throw new BadRequestException(critical.get(0).message());
        }
        if (!errors.isEmpty()) {
            throw new BadRequestException(errors.get(0));
        }
        UUID clientId = request != null && request.clientId() != null
                ? request.clientId()
                : entity.getClientId();
        if (clientId == null) {
            throw new BadRequestException("Selecciona un cliente del SIG para guardar la cotización.");
        }
        LocalDate validUntil = parseDate(normalized.validUntil());
        QuoteCreateRequest create = new QuoteCreateRequest(
                clientId,
                request != null ? request.advisorId() : null,
                firstNonBlank(normalized.name(), "Cotización Escuela Aves"),
                buildDescription(normalized),
                normalized.total() != null ? normalized.total() : BigDecimal.ZERO,
                normalized.currency() != null ? normalized.currency() : "COP",
                CommercialStatus.DRAFT,
                validUntil != null ? validUntil : LocalDate.now().plusDays(15)
        );
        QuoteDto saved = commercialService.createQuote(create);
        QuoteDraftDto withCode = withQuoteNumbers(normalized, saved.code());
        entity.setCommercialQuoteId(saved.id());
        entity.setQuoteCode(saved.code());
        entity.setClientId(clientId);
        entity.setDraftJson(writeJson(withCode));
        entity.setStatus("GENERATED");
        entity.setClientName(withCode.clientName());
        intelligentQuoteJpaRepository.save(entity);
        return new ApproveIntelligentQuoteResponse(entity.getId(), saved.id(), saved.code(), withCode);
    }

    private IntelligentQuoteEntity load(UUID id) {
        return intelligentQuoteJpaRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Cotización inteligente no encontrada"));
    }

    private IntelligentQuoteResponse toResponse(IntelligentQuoteEntity entity, String stage) {
        return new IntelligentQuoteResponse(
                entity.getId(),
                entity.getStatus(),
                readDraft(entity.getDraftJson()),
                readMissing(entity.getMissingJson()),
                readStringList(entity.getWarningsJson()),
                entity.getConfidence(),
                readTrace(entity.getTraceJson()),
                List.of(),
                stage
        );
    }

    private QuoteDraftDto stripHtml(QuoteDraftDto src) {
        if (src == null) {
            return null;
        }
        List<QuoteLineItemDto> items = src.items() == null ? List.of() : src.items().stream()
                .map(i -> new QuoteLineItemDto(
                        sanitizeText(i.description()),
                        i.quantity(),
                        i.unit(),
                        i.unitPrice(),
                        i.discount(),
                        i.iva(),
                        i.total()
                ))
                .toList();
        return new QuoteDraftDto(
                src.code(), sanitizeText(src.name()), src.modality(), src.people(),
                src.unitPrice(), src.total(), src.currency(), src.date(),
                sanitizeText(src.pickup()), sanitizeText(src.clientName()),
                sanitizeText(src.notes()), sanitizeText(src.includes()), sanitizeText(src.excludes()),
                src.reviewFlag(), src.priceScaleByPax(), items,
                sanitizeText(src.clientNit()), sanitizeText(src.clientPhone()),
                sanitizeText(src.clientEmail()), sanitizeText(src.clientCity()),
                sanitizeText(src.clientContact()), sanitizeText(src.clientAddress()),
                sanitizeText(src.advisorName()), sanitizeText(src.quoteNumber()),
                src.issuedAt(), src.validUntil(), sanitizeText(src.observations()),
                sanitizeText(src.commercialConditions()), src.status()
        );
    }

    private QuoteDraftDto withQuoteNumbers(QuoteDraftDto src, String code) {
        return new QuoteDraftDto(
                code, src.name(), src.modality(), src.people(), src.unitPrice(), src.total(),
                src.currency(), src.date(), src.pickup(), src.clientName(), src.notes(),
                src.includes(), src.excludes(), src.reviewFlag(), src.priceScaleByPax(), src.items(),
                src.clientNit(), src.clientPhone(), src.clientEmail(), src.clientCity(),
                src.clientContact(), src.clientAddress(), src.advisorName(), code,
                src.issuedAt(), src.validUntil(), src.observations(), src.commercialConditions(), src.status()
        );
    }

    private boolean stillCritical(MissingInfo m, QuoteDraftDto doc) {
        if ("tarifa".equalsIgnoreCase(m.field())) {
            return doc.items() == null || doc.items().stream()
                    .anyMatch(i -> i.unitPrice() == null || i.unitPrice().compareTo(BigDecimal.ZERO) <= 0);
        }
        if ("cantidad".equalsIgnoreCase(m.field())) {
            return doc.items() == null || doc.items().stream()
                    .anyMatch(i -> i.quantity() == null || i.quantity() <= 0);
        }
        if ("servicio".equalsIgnoreCase(m.field())) {
            return doc.items() == null || doc.items().isEmpty()
                    || doc.items().stream().allMatch(i -> i.description() == null || i.description().isBlank());
        }
        return false;
    }

    private String buildDescription(QuoteDraftDto doc) {
        if (doc.items() == null || doc.items().isEmpty()) {
            return doc.observations();
        }
        return doc.items().stream()
                .map(i -> i.description() + " × " + i.quantity())
                .collect(Collectors.joining(" | "));
    }

    private String nextQuoteCode() {
        String stamp = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
        int rnd = ThreadLocalRandom.current().nextInt(1000, 9999);
        return "COT-" + stamp + "-" + rnd;
    }

    private String sanitizeText(String raw) {
        if (raw == null) {
            return null;
        }
        String plain = raw.replaceAll("(?is)<script.*?>.*?</script>", " ")
                .replaceAll("(?is)<style.*?>.*?</style>", " ")
                .replaceAll("(?s)<[^>]+>", " ")
                .replace("{{", "")
                .replace("}}", "")
                .replaceAll("\\s+", " ")
                .trim();
        return HtmlUtils.htmlUnescape(plain);
    }

    private QuoteDraftDto readDraft(String json) {
        try {
            return objectMapper.readValue(json, QuoteDraftDto.class);
        } catch (Exception ex) {
            throw new BadRequestException("No se pudo leer el borrador de cotización.");
        }
    }

    private List<MissingInfo> readMissing(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json,
                    objectMapper.getTypeFactory().constructCollectionType(List.class, MissingInfo.class));
        } catch (Exception ex) {
            return List.of();
        }
    }

    @SuppressWarnings("unchecked")
    private List<String> readStringList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, List.class);
        } catch (Exception ex) {
            return List.of();
        }
    }

    private List<FieldTrace> readTrace(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json,
                    objectMapper.getTypeFactory().constructCollectionType(List.class, FieldTrace.class));
        } catch (Exception ex) {
            return List.of();
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("No se pudo serializar cotización inteligente", ex);
        }
    }

    private static LocalDate parseDate(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(raw.substring(0, Math.min(10, raw.length())));
        } catch (Exception ex) {
            return null;
        }
    }

    private static void put(Map<String, String> map, String key, String value) {
        if (value != null && !value.isBlank()) {
            map.put(key, value.trim());
        }
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v.trim();
            }
        }
        return null;
    }
}
