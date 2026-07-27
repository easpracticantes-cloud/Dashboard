package com.escuelaaves.sig.domain.port.in;

import com.escuelaaves.sig.application.dto.user.ProfileUpdateRequest;
import com.escuelaaves.sig.application.dto.user.UserCreateRequest;
import com.escuelaaves.sig.application.dto.user.UserDto;
import com.escuelaaves.sig.application.dto.user.UserUpdateRequest;

import java.util.List;
import java.util.UUID;

public interface UserUseCase {

    List<UserDto> listUsers();

    UserDto getUser(UUID id);

    UserDto createUser(UserCreateRequest request);

    UserDto updateUser(UUID id, UserUpdateRequest request);

    void deleteUser(UUID id);

    UserDto getProfile();

    UserDto updateProfile(ProfileUpdateRequest request);
}
