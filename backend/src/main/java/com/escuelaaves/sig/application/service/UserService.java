package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.user.ProfileUpdateRequest;
import com.escuelaaves.sig.application.dto.user.UserCreateRequest;
import com.escuelaaves.sig.application.dto.user.UserDto;
import com.escuelaaves.sig.application.dto.user.UserUpdateRequest;
import com.escuelaaves.sig.application.mapper.UserMapper;
import com.escuelaaves.sig.application.service.support.CurrentUserService;
import com.escuelaaves.sig.domain.port.in.UserUseCase;
import com.escuelaaves.sig.domain.port.out.RoleRepositoryPort;
import com.escuelaaves.sig.domain.port.out.UserRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.RoleEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.UserEntity;
import com.escuelaaves.sig.shared.exception.ConflictException;
import com.escuelaaves.sig.shared.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserService implements UserUseCase {

    private final UserRepositoryPort userRepositoryPort;
    private final RoleRepositoryPort roleRepositoryPort;
    private final PasswordEncoder passwordEncoder;
    private final UserMapper userMapper;
    private final CurrentUserService currentUserService;

    @Override
    public List<UserDto> listUsers() {
        return userRepositoryPort.findAll().stream().map(userMapper::toDto).toList();
    }

    @Override
    public UserDto getUser(UUID id) {
        return userMapper.toDto(findUserOrThrow(id));
    }

    @Override
    @Transactional
    public UserDto createUser(UserCreateRequest request) {
        if (userRepositoryPort.existsByUsername(request.username())) {
            throw new ConflictException("El nombre de usuario ya esta en uso");
        }
        if (userRepositoryPort.existsByEmail(request.email())) {
            throw new ConflictException("El correo ya esta registrado");
        }

        RoleEntity role = roleRepositoryPort.findByName(request.role())
                .orElseThrow(() -> new ResourceNotFoundException("Rol no encontrado: " + request.role()));

        UserEntity user = UserEntity.builder()
                .username(request.username())
                .email(request.email())
                .passwordHash(passwordEncoder.encode(request.password()))
                .fullName(request.fullName())
                .avatarUrl(request.avatarUrl())
                .role(role)
                .active(request.active() == null || request.active())
                .build();

        return userMapper.toDto(userRepositoryPort.save(user));
    }

    @Override
    @Transactional
    public UserDto updateUser(UUID id, UserUpdateRequest request) {
        UserEntity user = findUserOrThrow(id);

        if (request.email() != null && !request.email().equalsIgnoreCase(user.getEmail())
                && userRepositoryPort.existsByEmail(request.email())) {
            throw new ConflictException("El correo ya esta registrado");
        }

        if (request.email() != null) {
            user.setEmail(request.email());
        }
        if (request.fullName() != null) {
            user.setFullName(request.fullName());
        }
        if (request.avatarUrl() != null) {
            user.setAvatarUrl(request.avatarUrl());
        }
        if (request.role() != null) {
            RoleEntity role = roleRepositoryPort.findByName(request.role())
                    .orElseThrow(() -> new ResourceNotFoundException("Rol no encontrado: " + request.role()));
            user.setRole(role);
        }
        if (request.active() != null) {
            user.setActive(request.active());
        }
        if (request.password() != null && !request.password().isBlank()) {
            user.setPasswordHash(passwordEncoder.encode(request.password()));
        }

        return userMapper.toDto(userRepositoryPort.save(user));
    }

    @Override
    @Transactional
    public void deleteUser(UUID id) {
        findUserOrThrow(id);
        userRepositoryPort.deleteById(id);
    }

    @Override
    public UserDto getProfile() {
        return userMapper.toDto(currentUserService.getCurrentUser());
    }

    @Override
    @Transactional
    public UserDto updateProfile(ProfileUpdateRequest request) {
        UserEntity user = currentUserService.getCurrentUser();

        if (request.fullName() != null && !request.fullName().isBlank()) {
            user.setFullName(request.fullName().trim());
        }
        if (request.email() != null && !request.email().isBlank()) {
            String email = request.email().trim().toLowerCase();
            if (!email.equalsIgnoreCase(user.getEmail()) && userRepositoryPort.existsByEmail(email)) {
                throw new ConflictException("El correo ya esta registrado");
            }
            user.setEmail(email);
        }
        if (request.avatarUrl() != null) {
            String avatar = request.avatarUrl().isBlank() ? null : request.avatarUrl().trim();
            user.setAvatarUrl(avatar);
        }
        if (request.password() != null && !request.password().isBlank()) {
            user.setPasswordHash(passwordEncoder.encode(request.password()));
        }

        return userMapper.toDto(userRepositoryPort.save(user));
    }

    private UserEntity findUserOrThrow(UUID id) {
        return userRepositoryPort.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado: " + id));
    }
}
