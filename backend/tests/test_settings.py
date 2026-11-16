from app.core.config import Settings


def test_cors_origins_accepts_comma_separated_environment_value(monkeypatch) -> None:
    monkeypatch.setenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://localhost:3000,http://localhost",
    )

    settings = Settings(_env_file=None)

    assert settings.CORS_ORIGINS == [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost",
    ]
