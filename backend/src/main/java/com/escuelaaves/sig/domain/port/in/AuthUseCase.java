package com.escuelaaves.sig.domain.port.in;

import com.escuelaaves.sig.application.dto.auth.ForgotPasswordRequest;
import com.escuelaaves.sig.application.dto.auth.LoginRequest;
import com.escuelaaves.sig.application.dto.auth.LoginResponse;
import com.escuelaaves.sig.application.dto.auth.RefreshTokenRequest;
import com.escuelaaves.sig.application.dto.auth.ResetPasswordRequest;
import com.escuelaaves.sig.application.dto.user.UserDto;

public interface AuthUseCase {

    LoginResponse login(LoginRequest request);

    LoginResponse refresh(RefreshTokenRequest request);

    void forgotPassword(ForgotPasswordRequest request);

    void resetPassword(ResetPasswordRequest request);

    UserDto me();
}
