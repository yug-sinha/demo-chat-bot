from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Falls back to a local sqlite file so the app runs out of the box before
    # a real Postgres URL is provided. Production should always set DATABASE_URL.
    database_url: str = "sqlite:///./dev.db"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    cors_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
