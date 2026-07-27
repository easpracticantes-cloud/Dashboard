package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.dto.user.UserCreateRequest;
import com.escuelaaves.sig.application.dto.user.UserDto;
import com.escuelaaves.sig.application.dto.user.UserUpdateRequest;
import com.escuelaaves.sig.domain.port.in.UserUseCase;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
@Tag(name = "Usuarios", description = "Administracion de usuarios del sistema (solo ADMINISTRADOR)")
public class UserController {

    private final UserUseCase userUseCase;

    @GetMapping
    @Operation(summary = "Lista todos los usuarios")
    public ResponseEntity<List<UserDto>> list() {
        return ResponseEntity.ok(userUseCase.listUsers());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Obtiene un usuario por id")
    public ResponseEntity<UserDto> get(@PathVariable UUID id) {
        return ResponseEntity.ok(userUseCase.getUser(id));
    }

    @PostMapping
    @Operation(summary = "Crea un nuevo usuario")
    public ResponseEntity<UserDto> create(@Valid @RequestBody UserCreateRequest request) {
        return ResponseEntity.status(201).body(userUseCase.createUser(request));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Actualiza un usuario existente")
    public ResponseEntity<UserDto> update(@PathVariable UUID id, @Valid @RequestBody UserUpdateRequest request) {
        return ResponseEntity.ok(userUseCase.updateUser(id, request));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Elimina un usuario")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        userUseCase.deleteUser(id);
        return ResponseEntity.noContent().build();
    }
}
