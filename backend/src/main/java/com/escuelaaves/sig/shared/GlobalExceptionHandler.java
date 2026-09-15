package com.escuelaaves.sig.shared;

import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.escuelaaves.sig.shared.exception.ConflictException;
import com.escuelaaves.sig.shared.exception.ResourceNotFoundException;
import com.escuelaaves.sig.shared.exception.UnauthorizedException;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;

import java.util.List;

/**
 * Manejo global de errores para toda la API. Traduce las excepciones de
 * negocio y de framework en respuestas {@link ApiError} consistentes.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(ResourceNotFoundException ex, HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), request);
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<ApiError> handleBadRequest(BadRequestException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage(), request);
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ApiError> handleConflict(ConflictException ex, HttpServletRequest request) {
        return build(HttpStatus.CONFLICT, ex.getMessage(), request);
    }

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<ApiError> handleUnauthorized(UnauthorizedException ex, HttpServletRequest request) {
        return build(HttpStatus.UNAUTHORIZED, ex.getMessage(), request);
    }

    @ExceptionHandler({BadCredentialsException.class, DisabledException.class})
    public ResponseEntity<ApiError> handleAuthentication(RuntimeException ex, HttpServletRequest request) {
        return build(HttpStatus.UNAUTHORIZED, "Credenciales invalidas", request);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiError> handleAccessDenied(AccessDeniedException ex, HttpServletRequest request) {
        return build(HttpStatus.FORBIDDEN, "No tiene permisos para realizar esta accion", request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex, HttpServletRequest request) {
        List<ApiError.FieldViolation> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> new ApiError.FieldViolation(fe.getField(), fe.getDefaultMessage()))
                .toList();
        ApiError error = ApiError.of(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                "Error de validacion en la peticion",
                request.getRequestURI(),
                fieldErrors
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiError> handleMaxUpload(MaxUploadSizeExceededException ex, HttpServletRequest request) {
        log.warn("Subida demasiado grande en {}: {}", request.getRequestURI(), ex.getMessage());
        return build(
                HttpStatus.PAYLOAD_TOO_LARGE,
                "El archivo supera el limite de subida del backend (250 MB). Divide el ZIP o sube menos facturas por vez.",
                request
        );
    }

    @ExceptionHandler(MultipartException.class)
    public ResponseEntity<ApiError> handleMultipart(MultipartException ex, HttpServletRequest request) {
        log.warn("Error multipart en {}: {}", request.getRequestURI(), ex.getMessage());
        Throwable root = ex.getMostSpecificCause() != null ? ex.getMostSpecificCause() : ex;
        String detail = root.getMessage() != null ? root.getMessage() : ex.getMessage();
        if (detail != null && detail.toLowerCase().contains("size")) {
            return build(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "La carga supera el limite multipart del servidor. Sube menos archivos o un ZIP mas pequeno.",
                    request
            );
        }
        return build(
                HttpStatus.BAD_REQUEST,
                "No se pudo leer la carga multipart. Intenta de nuevo con menos archivos.",
                request
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleGeneric(Exception ex, HttpServletRequest request) {
        log.error("Error no controlado procesando {}", request.getRequestURI(), ex);
        String hint = ex.getClass().getSimpleName();
        String msg = ex.getMessage();
        if (msg != null && !msg.isBlank() && msg.length() < 180) {
            return build(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Ocurrio un error inesperado (" + hint + "): " + msg,
                    request
            );
        }
        return build(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "Ocurrio un error inesperado (" + hint + "). Revisa logs del backend.",
                request
        );
    }

    private ResponseEntity<ApiError> build(HttpStatus status, String message, HttpServletRequest request) {
        ApiError error = ApiError.of(status.value(), status.getReasonPhrase(), message, request.getRequestURI());
        return ResponseEntity.status(status).body(error);
    }
}
