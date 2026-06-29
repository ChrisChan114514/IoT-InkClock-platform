"""Pydantic models for API request/response validation."""

from __future__ import annotations

from datetime import date, time
from typing import Optional, List
from pydantic import BaseModel, Field


# ============================================================================
# Device
# ============================================================================

class DeviceCreate(BaseModel):
    device_id: str = Field(..., max_length=64)
    device_name: str = Field(default="", max_length=64)
    device_key: str = Field(..., min_length=8, max_length=64)


class DeviceResponse(BaseModel):
    device_id: str
    device_name: str
    online: bool = False
    rssi: Optional[int] = None
    fw_ver: Optional[str] = None
    last_seen: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================================================
# Word
# ============================================================================

class WordCreate(BaseModel):
    word: str = Field(..., max_length=64)
    phonetic: str = Field(default="", max_length=128)
    definition: str = Field(..., max_length=256)
    example: str = Field(default="", max_length=512)
    level: str = Field(default="B1", max_length=4)  # A1-C2
    tags: List[str] = Field(default_factory=list)


class WordResponse(BaseModel):
    id: int
    word: str
    phonetic: str
    definition: str
    example: str
    level: str
    tags: str  # JSON string
    created_at: str

    class Config:
        from_attributes = True


class WordPushRequest(BaseModel):
    word_id: int
    device_ids: List[str]


# ============================================================================
# Schedule
# ============================================================================

class ScheduleCreate(BaseModel):
    title: str = Field(..., max_length=128)
    schedule_time: str = Field(..., description="HH:MM format")
    schedule_date: Optional[str] = Field(
        default=None, description="YYYY-MM-DD, null for repeating"
    )
    repeat: str = Field(default="none")
    alert_before_min: int = Field(default=10, ge=0, le=120)
    device_ids: List[str] = Field(default_factory=list)


class ScheduleResponse(BaseModel):
    id: int
    title: str
    schedule_time: str
    schedule_date: Optional[str]
    repeat: str
    alert_before_min: int
    active: bool
    created_at: str

    class Config:
        from_attributes = True


# ============================================================================
# Display Text
# ============================================================================

class DisplayLine(BaseModel):
    text: str = Field(..., max_length=100)
    size: int = Field(default=32, ge=8, le=64)
    y: int = Field(default=0, ge=0, le=128)


class DisplayPushRequest(BaseModel):
    device_ids: List[str]
    lines: List[DisplayLine]
    duration_sec: int = Field(default=30, ge=5, le=300)


# ============================================================================
# System
# ============================================================================

class SystemStatus(BaseModel):
    mqtt_connected: bool
    devices_online: int
    devices_total: int
    words_total: int
    schedules_active: int


class LoginRequest(BaseModel):
    username: str
    password: str
