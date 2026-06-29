#!/usr/bin/env python3
"""
ClockMQTT — Web Console Backend
================================
FastAPI server providing REST API for device management,
word library, schedule management, and system control.

Server: 120.26.111.75
API Port: 2081
MQTT Broker: Aedes (localhost:2080)

Usage:
    python app.py                     # dev mode, port 2081
    uvicorn app:app --host 0.0.0.0 --port 2081  # production
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_db
from mqtt_client import mqtt_broker

# Import route modules (registers them with their routers)
from routes import devices, words, schedules, system

# ============================================================================
# Logging
# ============================================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("clockmqtt")

# ============================================================================
# App Lifecycle
# ============================================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown."""
    logger.info("=" * 50)
    logger.info("ClockMQTT Web Console Starting...")
    logger.info("MQTT Broker: Aedes @ localhost:2080")
    logger.info("API Server:  0.0.0.0:2081")
    logger.info("=" * 50)

    # Init database
    init_db()

    # Connect to MQTT broker
    mqtt_broker.connect()

    # Wire up MQTT status → device tracker
    mqtt_broker.on_topic("inkpad/+/status", devices.update_device_status)

    yield

    # Shutdown
    logger.info("Shutting down...")
    mqtt_broker.disconnect()


# ============================================================================
# App
# ============================================================================

app = FastAPI(
    title="ClockMQTT — IoT E-Paper Clock Console",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS (allow frontend from any origin in dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Routes
# ============================================================================

app.include_router(devices.router)
app.include_router(words.router)
app.include_router(schedules.router)
app.include_router(system.router)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "mqtt_connected": mqtt_broker.is_connected,
    }


# ============================================================================
# Static files (frontend) — served in production
# ============================================================================

from pathlib import Path

frontend_dir = Path(__file__).parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
    logger.info(f"Frontend served from: {frontend_dir}")


# ============================================================================
# Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=2081,
        reload=True,
        log_level="info",
    )
