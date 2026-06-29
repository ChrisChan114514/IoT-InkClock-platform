"""Schedule Management API."""

from fastapi import APIRouter, HTTPException
from models.schemas import ScheduleCreate
from mqtt_client import mqtt_broker

router = APIRouter(prefix="/api/schedules", tags=["schedules"])

# In-memory schedule store (replace with DB in production)
_schedules: list[dict] = []
_next_id = 1


@router.get("")
def list_schedules(device_id: str = ""):
    """List schedules, optionally filtered by device."""
    result = _schedules
    if device_id:
        result = [s for s in result if device_id in s.get("device_ids", [])]
    return {"schedules": result, "total": len(result)}


@router.post("")
def create_schedule(req: ScheduleCreate):
    """Create a new schedule and push to devices."""
    global _next_id
    sched = {
        "id": _next_id,
        "title": req.title,
        "schedule_time": req.schedule_time,
        "schedule_date": req.schedule_date,
        "repeat": req.repeat,
        "alert_before_min": req.alert_before_min,
        "device_ids": req.device_ids,
        "active": True,
    }
    _schedules.append(sched)
    _next_id += 1

    # Push to each target device
    for did in req.device_ids:
        schedules_for_device = [
            {
                "id": f"sched_{s['id']:03d}",
                "title": s["title"],
                "time": s["schedule_time"],
                "date": s["schedule_date"],
                "repeat": s["repeat"],
                "alert_before_min": s["alert_before_min"],
            }
            for s in _schedules
            if did in s.get("device_ids", []) and s["active"]
        ]
        mqtt_broker.publish_schedule(did, schedules_for_device)

    return {"status": "ok", "schedule": sched}


@router.put("/{schedule_id}")
def update_schedule(schedule_id: int, req: ScheduleCreate):
    """Update a schedule."""
    sched = next((s for s in _schedules if s["id"] == schedule_id), None)
    if not sched:
        raise HTTPException(404, "Schedule not found")

    sched.update({
        "title": req.title,
        "schedule_time": req.schedule_time,
        "schedule_date": req.schedule_date,
        "repeat": req.repeat,
        "alert_before_min": req.alert_before_min,
        "device_ids": req.device_ids,
    })
    return {"status": "ok", "schedule": sched}


@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: int):
    """Delete a schedule."""
    global _schedules
    _schedules = [s for s in _schedules if s["id"] != schedule_id]
    return {"status": "ok"}
