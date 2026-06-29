"""System API — status, login."""

from fastapi import APIRouter, HTTPException
from models.schemas import DisplayPushRequest, LoginRequest, SystemStatus
from mqtt_client import mqtt_broker

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/system/status")
def get_status():
    """Get system overview."""
    return {
        "mqtt_connected": mqtt_broker.is_connected,
        "devices_online": 0,   # would query from real status tracking
        "devices_total": 1,
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
