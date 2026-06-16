# --------------------------------------------------------
# Configuration Module
# Autor: Jonatan Gutierrez (JG)
# --------------------------------------------------------

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Tokenizador Cost Simulator"
    database_url: str = "sqlite:///./tokenizer.db"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    gemini_api_key: str | None = None
    groq_api_key: str | None = None
    cerebras_api_key: str | None = None
    openai_api_key: str | None = None
    deepseek_api_key: str | None = None
    custom_providers: str = "[]"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
