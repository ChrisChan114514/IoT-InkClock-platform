"""System API — status, login."""

import time
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException
from models.schemas import DisplayPushRequest, LoginRequest, SystemStatus
from mqtt_client import mqtt_broker
from routes.devices import _device_status

router = APIRouter(prefix="/api", tags=["system"])

# Timezone for China Standard Time (UTC+8)
CST = timezone(timedelta(hours=8))


@router.get("/system/status")
def get_status():
    """Get system overview."""
    online_count = sum(1 for s in _device_status.values() if s.get("online"))
    return {
        "mqtt_connected": mqtt_broker.is_connected,
        "devices_online": online_count,
        "devices_total": max(1, len(_device_status)),
        "words_total": 3,
        "schedules_active": 0,
    }


@router.post("/auth/login")
def login(req: LoginRequest):
    """Simple admin login."""
    if req.username == "admin" and req.password == "admin123":
        return {"status": "ok", "token": "demo-jwt-token-change-in-production"}
    raise HTTPException(401, "Invalid credentials")


@router.post("/devices/{device_id}/command")
def send_display_command(device_id: str, req: DisplayPushRequest):
    """Send a display text command to a device."""
    lines = [{"text": line.text, "size": line.size, "y": line.y} for line in req.lines]
    mqtt_broker.publish_display_text(device_id, lines, req.duration_sec)
    return {"status": "ok", "device": device_id}
