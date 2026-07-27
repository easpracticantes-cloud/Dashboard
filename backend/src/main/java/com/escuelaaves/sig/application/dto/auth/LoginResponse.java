package com.escuelaaves.sig.application.dto.auth;

import com.escuelaaves.sig.application.dto.user.UserDto;

public record LoginResponse(
        String token,
        String refreshToken,
        String tokenType,
        long expiresInMinutes,
        UserDto user
) {
}
