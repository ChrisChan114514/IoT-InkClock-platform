"""Device Management API."""

import json
import time
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from models.schemas import DeviceCreate, DeviceResponse

router = APIRouter(prefix="/api/devices", tags=["devices"])

# China Standard Time (UTC+8)
CST = timezone(timedelta(hours=8))

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
            was_offline = not _device_status.get(device_id, {}).get("online", False)
            is_online = data.get("online", False)

            _device_status[device_id] = {
                "online": is_online,
                "rssi": data.get("rssi"),
                "fw_ver": data.get("fw_ver"),
                "last_seen": datetime.now(CST).isoformat(),
            }

            # Auto-publish UTC+8 time when device just came online
            if was_offline and is_online:
                _publish_time_sync(device_id)
        except json.JSONDecodeError:
            pass


def _publish_time_sync(device_id: str) -> None:
    """Publish current UTC+8 time to the device's time/sync topic."""
    from mqtt_client import mqtt_broker
    now = datetime.now(CST)
    timestamp = int(now.timestamp())
    mqtt_broker.publish(
        f"inkpad/{device_id}/time/sync",
        {
            "timestamp": timestamp,
            "timezone": "Asia/Shanghai",
            "datetime": now.strftime("%Y-%m-%d %H:%M:%S"),
        },
        qos=0,
    )


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
