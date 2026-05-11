from fastapi import HTTPException, status


class AppError(Exception):
    """Base application error with optional code for API responses."""

    def __init__(self, message: str, code: str | None = None) -> None:
        self.message = message
        self.code = code
        super().__init__(message)


class NotFoundError(AppError):
    pass


class ForbiddenError(AppError):
    pass


class ConflictError(AppError):
    pass


class ValidationAppError(AppError):
    pass


def http_error(
    status_code: int,
    message: str,
    code: str | None = None,
) -> HTTPException:
    detail: dict = {"message": message}
    if code:
        detail["code"] = code
    return HTTPException(status_code=status_code, detail=detail)


def unauthorized(message: str = "Not authenticated", code: str | None = None) -> HTTPException:
    return http_error(status.HTTP_401_UNAUTHORIZED, message, code)


def forbidden(message: str = "Forbidden", code: str | None = None) -> HTTPException:
    return http_error(status.HTTP_403_FORBIDDEN, message, code)
