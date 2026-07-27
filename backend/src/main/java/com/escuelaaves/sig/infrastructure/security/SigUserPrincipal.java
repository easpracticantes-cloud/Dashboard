package com.escuelaaves.sig.infrastructure.security;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.UserEntity;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Adaptador entre {@link UserEntity} y el contrato {@link UserDetails} que
 * requiere Spring Security.
 */
@Getter
public class SigUserPrincipal implements UserDetails {

    private final UUID id;
    private final String username;
    private final String email;
    private final String fullName;
    private final String password;
    private final String role;
    private final boolean active;

    public SigUserPrincipal(UserEntity user) {
        this.id = user.getId();
        this.username = user.getUsername();
        this.email = user.getEmail();
        this.fullName = user.getFullName();
        this.password = user.getPasswordHash();
        this.role = user.getRole().getName().name();
        this.active = user.isActive();
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role));
    }

    @Override
    public String getPassword() {
        return password;
    }

    @Override
    public String getUsername() {
        return username;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return active;
    }
}
