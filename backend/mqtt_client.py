"""ClockMQTT Broker Client — Paho MQTT wrapper.

Handles communication between the Web Console and Aedes MQTT broker.
Both run on the same server, so broker is at localhost:2082.
"""

from __future__ import annotations

import json
import logging
import threading
from typing import Callable, Optional

import paho.mqtt.client as mqtt

logger = logging.getLogger("mqtt_client")

# ============================================================================
# Config
# ============================================================================

MQTT_BROKER_HOST = "127.0.0.1"
MQTT_BROKER_PORT = 2082
MQTT_USERNAME = "admin"
MQTT_PASSWORD = "admin123"  # CHANGE IN PRODUCTION

# ============================================================================
# Client
# ============================================================================


class ClockMQTTClient:
    """Singleton MQTT client for the Web Console backend."""

    _instance: Optional["ClockMQTTClient"] = None

    def __new__(cls) -> "ClockMQTTClient":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if hasattr(self, "_initialized"):
            return
        self._initialized = True

        self._client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        self._client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
        self._client.on_connect = self._on_connect
        self._client.on_message = self._on_message

        self._handlers: dict[str, list[Callable]] = {}
        self._connected = False
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------

    def connect(self) -> None:
        """Connect to the MQTT broker."""
        if self._connected:
            return
        logger.info(f"Connecting to MQTT broker at {MQTT_BROKER_HOST}:{MQTT_BROKER_PORT}")
        self._client.connect_async(MQTT_BROKER_HOST, MQTT_BROKER_PORT)
        self._client.loop_start()

    def disconnect(self) -> None:
        """Disconnect from the MQTT broker."""
        self._client.loop_stop()
        self._client.disconnect()
        self._connected = False

    @property
    def is_connected(self) -> bool:
        return self._connected

    # ------------------------------------------------------------------
    # Callbacks
    # ------------------------------------------------------------------

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            self._connected = True
            logger.info("MQTT connected OK")
            # Subscribe to all device status topics
            self._client.subscribe("inkpad/+/status")
        else:
            logger.error(f"MQTT connect failed: rc={reason_code}")

    def _on_message(self, client, userdata, msg):
        try:
            payload = msg.payload.decode("utf-8")
            logger.debug(f"MQTT RX: {msg.topic} → {payload[:100]}")
        except Exception:
            return

        # Dispatch to registered handlers
        with self._lock:
            for pattern, handlers in self._handlers.items():
                if mqtt.topic_matches_sub(pattern, msg.topic):
                    for handler in handlers:
                        try:
                            handler(msg.topic, payload)
                        except Exception as e:
                            logger.error(f"Handler error for {msg.topic}: {e}")

    def on_topic(self, pattern: str, handler: Callable) -> None:
        """Register a handler for a topic pattern."""
        with self._lock:
            self._handlers.setdefault(pattern, []).append(handler)

    # ------------------------------------------------------------------
    # Publish helpers
    # ------------------------------------------------------------------

    def publish(self, topic: str, payload: dict | str, qos: int = 1, retain: bool = False) -> None:
        """Publish a message to a topic."""
        if isinstance(payload, dict):
            payload = json.dumps(payload, ensure_ascii=False)
        info = self._client.publish(topic, payload, qos=qos, retain=retain)
        logger.debug(f"MQTT TX: {topic} → {str(payload)[:100]}")

    def publish_time_sync(self, device_id: str, timestamp: int) -> None:
        self.publish(
            f"inkpad/{device_id}/time/sync",
            {"timestamp": timestamp, "timezone": "Asia/Shanghai"},
            qos=0,
        )

    def publish_word(self, device_id: str, word_data: dict) -> None:
        self.publish(
            f"inkpad/{device_id}/word/daily",
            word_data,
            qos=1,
            retain=True,
        )

    def publish_schedule(self, device_id: str, schedules: list[dict]) -> None:
        self.publish(
            f"inkpad/{device_id}/schedule/update",
            {"version": 1, "schedules": schedules},
            qos=1,
            retain=True,
        )

    def publish_display_text(
        self, device_id: str, lines: list[dict], duration_sec: int = 30
    ) -> None:
        self.publish(
            f"inkpad/{device_id}/display/text",
            {"lines": lines, "duration_sec": duration_sec},
            qos=1,
        )

    def publish_config(self, device_id: str, config: dict) -> None:
        self.publish(
            f"inkpad/{device_id}/config/set",
            config,
            qos=1,
        )


# ============================================================================
# Singleton accessor
# ============================================================================

mqtt_broker = ClockMQTTClient()
