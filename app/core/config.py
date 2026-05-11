from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Remarkable API"
    debug: bool = False
    secret_key: str = "change-me"
    database_url: str = "postgresql+psycopg2://remarkable:remarkable@localhost:5432/remarkable"

    session_cookie_name: str = "remarkable_session"
    session_idle_minutes: int = 60
    session_warning_seconds: int = 300

    cors_origins: str = "http://localhost:3000"

    # IANA timezone for business-day cutoffs (e.g. barber edit lock after 21:00 local).
    business_timezone: str = "Africa/Lagos"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, v: str | list[str]) -> str:
        if isinstance(v, list):
            return ",".join(v)
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        raw = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        return raw if raw else ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
