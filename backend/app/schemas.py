from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Role = Literal["doctor", "client", "warehouse_staff", "admin", "community_partner"]
Allergen = Literal[
    "milk",
    "eggs",
    "fish",
    "crustacean_shellfish",
    "tree_nuts",
    "peanuts",
    "wheat",
    "soybeans",
    "sesame",
]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Login(Strict):
    email: str | None = Field(
        default=None, min_length=3, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    )
    username: str | None = Field(default=None, min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=1024)

    @model_validator(mode="after")
    def one_login(self):
        if not self.email and not self.username:
            raise ValueError("email or username is required")
        return self


class Register(Strict):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(
        default=None, min_length=3, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    )
    password: str = Field(min_length=8, max_length=1024)
    household_size: int = Field(ge=1, le=100, strict=True)
    icd10_codes: list[str] = Field(max_length=50)
    allergies: list[Allergen] = Field(default_factory=list, max_length=9)

    @model_validator(mode="after")
    def phone_or_email(self):
        if not self.phone and not self.email:
            raise ValueError("phone or email is required")
        return self


class UserCreate(Login):
    password: str = Field(min_length=8, max_length=1024)
    role: Role


class UserPatch(Strict):
    disabled: bool | None = None
    role: Role | None = None


class PasswordChange(Strict):
    current_password: str = Field(max_length=1024)
    new_password: str = Field(min_length=8, max_length=1024)


class ClientCreate(Login):
    password: str = Field(min_length=8, max_length=1024)
    legal_name: str = Field(min_length=1, max_length=200)
    phone: str = Field(default="", max_length=50)
    household_size: int = Field(ge=1, le=100, strict=True)
    icd10: list[str] = Field(max_length=50)
    allergens: list[Allergen] = Field(default_factory=list, max_length=9)
    k_limit_ordered: bool = False


class ClientPatch(Strict):
    phone: str | None = Field(default=None, max_length=50)
    household_size: int | None = Field(default=None, ge=1, le=100, strict=True)
    icd10: list[str] | None = Field(default=None, max_length=50)
    allergens: list[Allergen] | None = Field(default=None, max_length=9)
    k_limit_ordered: bool | None = None

    @model_validator(mode="after")
    def no_explicit_null(self):
        if any(getattr(self, key) is None for key in self.model_fields_set):
            raise ValueError("provided fields cannot be null")
        return self


class Arrival(Strict):
    token: str = Field(max_length=256)


class SessionBody(Strict):
    session_id: UUID


class Scan(SessionBody):
    barcode: str | None = Field(default=None, min_length=1, max_length=100)
    internal_code: str | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode="after")
    def one_code(self):
        if bool(self.barcode) == bool(self.internal_code):
            raise ValueError("supply exactly one barcode or internal_code")
        return self


class CartAdd(SessionBody):
    product_id: UUID


class Lookup(Strict):
    name: str = Field(min_length=1, max_length=200)


class Reissue(Strict):
    client_id: UUID


class LotCreate(Strict):
    product_id: UUID
    bin_id: UUID
    grant_id: str = Field(min_length=1, max_length=100)
    arrived_on: date
    expires_on: date
    qty: int = Field(ge=1, le=100000, strict=True)

    @model_validator(mode="after")
    def dates(self):
        if self.expires_on <= self.arrived_on:
            raise ValueError("expiration must follow arrival")
        return self


class ScanCode(Strict):
    code: str = Field(min_length=1, max_length=100)
    source: Literal["camera", "manual"] = "camera"


class CartItem(Strict):
    product_id: UUID
    qty: int = Field(default=1, ge=1, le=99, strict=True)


class CartQty(Strict):
    qty: int = Field(ge=0, le=99, strict=True)


class CheckoutCodes(Strict):
    codes: list[str] = Field(min_length=1, max_length=200)
