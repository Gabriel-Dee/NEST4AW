from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str
    jwt_secret: str
    phi_key: str
    hmac_key: str
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:5174"]
    fdc_api_key: str = ""
    off_user_agent: str = "NEST4AW/0.1 (hackathon nutrition warehouse)"
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5:1.5b"
    llm_timeout: float = 45
    ocr_timeout: float = 30
    ocr_url: str = ""
    ocr_worker_secret: str = ""

    @field_validator("jwt_secret", "phi_key", "hmac_key")
    @classmethod
    def secure_keys(cls, value):
        if len(value) < 32 or value.startswith("replace-"):
            raise ValueError("set independent random secrets of at least 32 characters")
        return value

    @field_validator("database_url")
    @classmethod
    def postgres_only(cls, value):
        if not value.startswith(("postgresql://", "postgres://")):
            raise ValueError("PostgreSQL is required")
        return value


@lru_cache
def settings():
    return Settings()
