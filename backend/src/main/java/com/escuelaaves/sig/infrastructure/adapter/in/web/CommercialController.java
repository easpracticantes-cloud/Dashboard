package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.dto.commercial.*;
import com.escuelaaves.sig.application.service.CommercialService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Tag(name = "Comercial", description = "Cotizaciones, reservas y ventas")
public class CommercialController {

    private final CommercialService commercialService;

    @GetMapping("/quotes")
    @Operation(summary = "Lista cotizaciones")
    public ResponseEntity<List<QuoteDto>> quotes() {
        return ResponseEntity.ok(commercialService.listQuotes());
    }

    @PostMapping("/quotes")
    public ResponseEntity<QuoteDto> createQuote(@Valid @RequestBody QuoteCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(commercialService.createQuote(request));
    }

    @DeleteMapping("/quotes/{id}")
    public ResponseEntity<Void> deleteQuote(@PathVariable UUID id) {
        commercialService.deleteQuote(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/reservations")
    @Operation(summary = "Lista reservas")
    public ResponseEntity<List<ReservationDto>> reservations() {
        return ResponseEntity.ok(commercialService.listReservations());
    }

    @PostMapping("/reservations")
    public ResponseEntity<ReservationDto> createReservation(@Valid @RequestBody ReservationCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(commercialService.createReservation(request));
    }

    @DeleteMapping("/reservations/{id}")
    public ResponseEntity<Void> deleteReservation(@PathVariable UUID id) {
        commercialService.deleteReservation(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/sales")
    @Operation(summary = "Lista ventas")
    public ResponseEntity<List<SaleDto>> sales() {
        return ResponseEntity.ok(commercialService.listSales());
    }

    @PostMapping("/sales")
    public ResponseEntity<SaleDto> createSale(@Valid @RequestBody SaleCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(commercialService.createSale(request));
    }

    @DeleteMapping("/sales/{id}")
    public ResponseEntity<Void> deleteSale(@PathVariable UUID id) {
        commercialService.deleteSale(id);
        return ResponseEntity.noContent().build();
    }
}
