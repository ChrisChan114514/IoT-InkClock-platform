/**
 * ClockMQTT — MQTT Client
 * ========================
 * Singleton mqtt.js wrapper. Replaces the Python Paho MQTT client.
 *
 * Unlike Paho's thread-based model, mqtt.js integrates with the Node.js
 * event loop — subscriptions in the 'connect' callback are reliably active
 * before any messages arrive, eliminating the Paho race condition.
 */

const mqtt = require('mqtt');

// ============================================================================
// Config
// ============================================================================

const MQTT_BROKER_URL  = 'mqtt://127.0.0.1:2082';
const MQTT_USERNAME    = 'admin';
const MQTT_PASSWORD    = 'admin123'; // CHANGE IN PRODUCTION
const MQTT_CLIENT_ID   = 'clockmqtt_web_backend';

// ============================================================================
// Topic Pattern Matching
// ============================================================================

/**
 * Check if an MQTT topic matches a subscription pattern.
 * Supports single-level (+) and multi-level (#) wildcards.
 * # must appear only at the end of the pattern.
 */
function topicMatchesPattern(pattern, topic) {
  const patParts = pattern.split('/');
  const topParts = topic.split('/');

  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i] === '#') {
      // Multi-level wildcard — matches everything remaining (including nothing)
      return i === patParts.length - 1; // valid only at end
    }
    if (patParts[i] === '+') {
      // Single-level wildcard — matches exactly one level
      if (i >= topParts.length) return false;
      continue;
    }
    if (i >= topParts.length || patParts[i] !== topParts[i]) {
      return false;
    }
  }
  return patParts.length === topParts.length;
}

// ============================================================================
// Client
// ============================================================================

class ClockMQTTClient {
  constructor() {
    this._client = null;
    this._connected = false;
    this._handlers = new Map(); // pattern -> [handlerFn]
  }

  // ------------------------------------------------------------------
  // Connection
  // ------------------------------------------------------------------

  connect() {
    if (this._client) return;

    console.log(`[MQTT] Connecting to ${MQTT_BROKER_URL} as "${MQTT_USERNAME}"...`);
    this._client = mqtt.connect(MQTT_BROKER_URL, {
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      clientId: MQTT_CLIENT_ID,
      clean: true,
      reconnectPeriod: 5000, // auto-reconnect every 5s
    });

    this._client.on('connect', () => {
      this._connected = true;
      console.log('[MQTT] Connected OK');

      // Subscribe to device status and presence topics
      this._client.subscribe(['inkpad/+/status', 'inkpad/+/presence'], { qos: 1 }, (err) => {
        if (err) {
          console.error('[MQTT] Subscribe error:', err.message);
        } else {
          console.log('[MQTT] Subscribed to inkpad/+/status and inkpad/+/presence');
        }
      });
    });

    this._client.on('reconnect', () => {
      console.log('[MQTT] Reconnecting...');
    });

    this._client.on('close', () => {
      this._connected = false;
      console.log('[MQTT] Connection closed');
    });

    this._client.on('error', (err) => {
      console.error('[MQTT] Error:', err.message);
    });

    this._client.on('message', (topic, payload) => {
      let text;
      try {
        text = payload.toString();
      } catch {
        console.warn(`[MQTT] RX: cannot decode payload on ${topic}`);
        return;
      }

      console.log(`[MQTT] RX: ${topic} → ${text.slice(0, 150)}`);

      // Dispatch to registered handlers
      let matched = false;
      for (const [pattern, handlers] of this._handlers) {
        if (topicMatchesPattern(pattern, topic)) {
          matched = true;
          for (const handler of handlers) {
            try {
              handler(topic, text);
            } catch (e) {
              console.error(`[MQTT] Handler error for ${topic}:`, e.message);
            }
          }
        }
      }
      if (!matched) {
        console.warn(`[MQTT] RX: no handler for ${topic} (patterns: ${[...this._handlers.keys()].join(', ')})`);
      }
    });
  }

  disconnect() {
    if (this._client) {
      this._client.end(true);
      this._client = null;
    }
    this._connected = false;
  }

  get isConnected() {
    return this._connected;
  }

  // ------------------------------------------------------------------
  // Handler registration
  // ------------------------------------------------------------------

  onTopic(pattern, handler) {
    if (!this._handlers.has(pattern)) {
      this._handlers.set(pattern, []);
    }
    this._handlers.get(pattern).push(handler);
    console.log(`[MQTT] Registered handler for "${pattern}"`);
  }

  // ------------------------------------------------------------------
  // Publish helpers
  // ------------------------------------------------------------------

  publish(topic, payload, qos = 1, retain = false) {
    if (!this._client || !this._connected) {
      console.warn(`[MQTT] TX skipped (not connected): ${topic}`);
      return;
    }
    const data = typeof payload === 'object' ? JSON.stringify(payload) : payload;
    this._client.publish(topic, data, { qos, retain }, (err) => {
      if (err) console.error(`[MQTT] TX error ${topic}:`, err.message);
    });
    console.log(`[MQTT] TX: ${topic} → ${data.slice(0, 100)}`);
  }

  publishTimeSync(deviceId, timestamp) {
    const now = new Date();
    this.publish(
      `inkpad/${deviceId}/time/sync`,
      {
        timestamp,
        timezone: 'Asia/Shanghai',
        datetime: now.toISOString(),
      },
      0, // qos=0
      false,
    );
  }

  publishWord(deviceId, wordData) {
    this.publish(
      `inkpad/${deviceId}/word/daily`,
      wordData,
      1,    // qos=1
      true, // retain
    );
  }

  publishSchedule(deviceId, schedules) {
    this.publish(
      `inkpad/${deviceId}/schedule/update`,
      { version: 1, schedules: Array.isArray(schedules) ? schedules : [schedules] },
      1,    // qos=1
      true, // retain
    );
  }

  publishDisplayText(deviceId, lines, durationSec = 30) {
    this.publish(
      `inkpad/${deviceId}/display/text`,
      { lines, duration_sec: durationSec },
      1,    // qos=1
      false,
    );
  }

  publishConfig(deviceId, config) {
    this.publish(
      `inkpad/${deviceId}/config/set`,
      config,
      1,    // qos=1
      false,
    );
  }
}

// Singleton
module.exports = new ClockMQTTClient();
