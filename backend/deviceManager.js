/**
 * ClockMQTT — Device Manager
 * ============================
 * Manages device registry, MQTT-driven status tracking, and heartbeat timeout.
 *
 * This is the core fix for the OFFLINE / 0/1 bug:
 *   - Registry size determines devices_total (not max(1, statusCount))
 *   - Heartbeat marks devices offline after 120s of silence
 */

const HEARTBEAT_INTERVAL_MS = 30 * 1000;   // check every 30s
const HEARTBEAT_TIMEOUT_MS  = 120 * 1000;  // mark offline after 2 min silence

class DeviceManager {
  constructor() {
    // registry:  deviceId -> { device_id, device_name, device_key, registered_at }
    this.registry = new Map();
    // status:    deviceId -> { online, rssi, fw_ver, last_seen, last_seen_iso }
    this.status   = new Map();
    this._heartbeatTimer = null;

    // Pre-register Clock1 (matches Python hardcoded default + frontend expectations)
    this.registerDevice({
      device_id: 'Clock1',
      device_name: 'Main Clock',
      device_key: 'changeme_clock1_key_32chars',
    });
  }

  // =========================================================================
  // Registration
  // =========================================================================

  registerDevice({ device_id, device_name, device_key }) {
    if (!device_id || typeof device_id !== 'string' || device_id.length > 64) {
      throw new Error('device_id must be 1-64 chars');
    }
    if (!device_key || device_key.length < 8) {
      throw new Error('device_key must be at least 8 chars');
    }
    if (this.registry.has(device_id)) {
      throw new Error(`Device "${device_id}" already registered`);
    }
    const entry = {
      device_id,
      device_name: device_name || device_id,
      device_key,
      registered_at: new Date().toISOString(),
    };
    this.registry.set(device_id, entry);
    console.log(`[DEVICE] Registered: ${device_id} (${entry.device_name})`);
    return entry;
  }

  removeDevice(device_id) {
    const existed = this.registry.has(device_id);
    this.registry.delete(device_id);
    this.status.delete(device_id);
    if (existed) console.log(`[DEVICE] Removed: ${device_id}`);
    return existed;
  }

  // =========================================================================
  // Status — called from MQTT message handler
  // =========================================================================

  /**
   * Update device online/offline from broker presence.
   * This is the authoritative source — the broker knows definitively
   * who is connected. Do NOT trust the device's self-reported "online" field.
   * @param {string} deviceId
   * @param {boolean} connected
   * @returns {{ justCameOnline: boolean }}
   */
  updatePresence(deviceId, connected) {
    const prev = this.status.get(deviceId) || {};
    const wasOffline = !prev.online;
    const isOnline = !!connected;

    // If device not in registry, auto-register it (discovered via MQTT)
    if (!this.registry.has(deviceId)) {
      this.registry.set(deviceId, {
        device_id: deviceId,
        device_name: deviceId,
        device_key: null,
        registered_at: new Date().toISOString(),
      });
      console.log(`[DEVICE] Auto-registered from presence: ${deviceId}`);
    }

    const now = Date.now();
    this.status.set(deviceId, {
      online: isOnline,
      rssi: prev.rssi ?? null,
      fw_ver: prev.fw_ver ?? null,
      last_seen: now,
      last_seen_iso: new Date().toISOString(),
    });

    if (wasOffline && isOnline) {
      console.log(`[DEVICE] ${deviceId} came ONLINE (presence)`);
    } else if (!wasOffline && !isOnline) {
      console.log(`[DEVICE] ${deviceId} went OFFLINE (presence)`);
    }

    return { justCameOnline: wasOffline && isOnline };
  }

  /**
   * Update device metadata (rssi, fw_ver) from status message.
   * Does NOT change online/offline — that's handled by presence.
   * @param {string} deviceId
   * @param {object} payload  { rssi, fw_ver }
   */
  updateMetadata(deviceId, payload) {
    const prev = this.status.get(deviceId) || {};

    // If device not in registry, auto-register it
    if (!this.registry.has(deviceId)) {
      this.registry.set(deviceId, {
        device_id: deviceId,
        device_name: deviceId,
        device_key: null,
        registered_at: new Date().toISOString(),
      });
      console.log(`[DEVICE] Auto-registered from status: ${deviceId}`);
    }

    const now = Date.now();
    this.status.set(deviceId, {
      online: prev.online ?? false,   // preserve presence-based online state
      rssi: payload.rssi ?? prev.rssi ?? null,
      fw_ver: payload.fw_ver ?? prev.fw_ver ?? null,
      last_seen: now,
      last_seen_iso: new Date().toISOString(),
    });

    if (payload.rssi) {
      console.log(`[DEVICE] ${deviceId} metadata: rssi=${payload.rssi}, fw=${payload.fw_ver ?? '?'}`);
    }
  }

  // =========================================================================
  // Heartbeat — periodic offline detection
  // =========================================================================

  startHeartbeat() {
    if (this._heartbeatTimer) return;
    this._heartbeatTimer = setInterval(() => this.checkHeartbeats(), HEARTBEAT_INTERVAL_MS);
    console.log(`[HEARTBEAT] Started (interval=${HEARTBEAT_INTERVAL_MS / 1000}s, timeout=${HEARTBEAT_TIMEOUT_MS / 1000}s)`);
  }

  stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
      console.log('[HEARTBEAT] Stopped');
    }
  }

  checkHeartbeats() {
    const now = Date.now();
    for (const [deviceId, s] of this.status) {
      if (s.online && (now - s.last_seen) > HEARTBEAT_TIMEOUT_MS) {
        s.online = false;
        console.log(`[HEARTBEAT] ${deviceId} timed out (last seen ${Math.round((now - s.last_seen) / 1000)}s ago) — marked offline`);
      }
    }
  }

  // =========================================================================
  // Queries
  // =========================================================================

  /** Merge registry + status for GET /api/devices response. */
  getAllDevices() {
    return Array.from(this.registry.values()).map(d => {
      const s = this.status.get(d.device_id) || {};
      return {
        device_id: d.device_id,
        device_name: d.device_name,
        online: s.online ?? false,
        rssi: s.rssi ?? null,
        fw_ver: s.fw_ver ?? null,
      };
    });
  }

  /** Get a single merged device object, or null if not registered. */
  getDevice(deviceId) {
    const d = this.registry.get(deviceId);
    if (!d) return null;
    const s = this.status.get(deviceId) || {};
    return {
      device_id: d.device_id,
      device_name: d.device_name,
      online: s.online ?? false,
      rssi: s.rssi ?? null,
      fw_ver: s.fw_ver ?? null,
    };
  }

  /** Dashboard stats: { online, total }. total = registry.size (FIX for the "0/1" bug). */
  getStats() {
    let onlineCount = 0;
    for (const s of this.status.values()) {
      if (s.online) onlineCount++;
    }
    return {
      online: onlineCount,
      total: this.registry.size,
    };
  }

  /** Raw status for a device (or empty object). */
  getStatus(deviceId) {
    return this.status.get(deviceId) || {};
  }
}

// Singleton
module.exports = new DeviceManager();
