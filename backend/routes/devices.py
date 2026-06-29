"""Device Management API."""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from models.schemas import DeviceCreate, DeviceResponse
import json

router = APIRouter(prefix="/api/devices", tags=["devices"])

# In-memory device status (updated by MQTT status messages)
_device_status: dict[str, dict] = {}


# Called by MQTT client when device status changes
def update_device_status(topic: str, payload: str) -> None:
    # Topic: inkpad/{device_id}/status
    parts = topic.split("/")
    if len(parts) >= 3:
        device_id = parts[1]
        try:
            data = json.loads(payload)
            _device_status[device_id] = {
                "online": data.get("online", False),
                "rssi": data.get("rssi"),
                "fw_ver": data.get("fw_ver"),
                "last_seen": None,  # would use datetime.now()
            }
        except json.JSONDecodeError:
            pass


@router.get("")
def list_devices():
    """List all registered devices with status."""
    # In production: read from DB, merge with _device_status
    devices = [
        {
            "device_id": "Clock1",
            "device_name": "Main Clock",
            "online": _device_status.get("Clock1", {}).get("online", False),
            "rssi": _device_status.get("Clock1", {}).get("rssi"),
            "fw_ver": _device_status.get("Clock1", {}).get("fw_ver"),
        }
    ]
    return {"devices": devices, "total": len(devices)}


@router.post("")
def add_device(req: DeviceCreate):
    """Register a new device."""
    # In production: save to DB, generate device_key
    return {
        "status": "ok",
        "device_id": req.device_id,
        "device_name": req.device_name,
        "message": "Device registered. Add credentials to broker/server.js USERS object.",
    }


@router.get("/{device_id}")
def get_device(device_id: str):
    """Get device detail."""
    status = _device_status.get(device_id, {})
    return {
        "device_id": device_id,
        "device_name": "Clock1" if device_id == "Clock1" else device_id,
        "online": status.get("online", False),
        "rssi": status.get("rssi"),
        "fw_ver": status.get("fw_ver"),
    }


@router.delete("/{device_id}")
def delete_device(device_id: str):
    """Delete a device."""
    _device_status.pop(device_id, None)
    return {"status": "ok", "message": f"Device {device_id} removed"}
