from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=4, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=10)


class UserSummary(BaseModel):
    id: str
    username: str
    full_name: str
    role: str
    shift_name: str | None = None
    store_id: str | None = None
    store_name: str | None = None
    store_ids: list[str] = Field(default_factory=list)
    permissions: dict[str, bool] = Field(default_factory=dict)
    is_active: bool


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserSummary
