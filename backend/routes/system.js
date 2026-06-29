/**
 * ClockMQTT — System Routes
 * ==========================
 * System status, auth, health, and device commands.
 *
 * Mounted at /api — handles:
 *   GET  /api/health
 *   GET  /api/system/status
 *   POST /api/auth/login
 *   POST /api/devices/:id/command
 */

const { Router } = require('express');
const mqttClient = require('../mqttClient');
const deviceManager = require('../deviceManager');
const wordStore = require('../wordStore');
const scheduleStore = require('../scheduleStore');

const router = Router();

// ===========================================================================
// GET /api/health
// ===========================================================================

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mqtt_connected: mqttClient.isConnected,
  });
});

// ===========================================================================
// GET /api/system/status — dashboard overview
// ===========================================================================

router.get('/system/status', (req, res) => {
  const stats = deviceManager.getStats();
  res.json({
    mqtt_connected: mqttClient.isConnected,
    devices_online: stats.online,
    devices_total: stats.total,        // FIX: uses registry.size, not max(1, statusCount)
    words_total: wordStore.count(),
    schedules_active: scheduleStore.countActive(),
  });
});

// ===========================================================================
// POST /api/auth/login
// ===========================================================================

router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'admin123') {
    return res.json({
      status: 'ok',
      token: 'demo-jwt-token-change-in-production',
    });
  }
  res.status(401).json({ detail: 'Invalid credentials' });
});

// ===========================================================================
// POST /api/devices/:id/command — send display text to a device
// ===========================================================================

router.post('/devices/:id/command', (req, res) => {
  try {
    const { id } = req.params;
    const { lines, duration_sec } = req.body;

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ detail: 'lines must be a non-empty array' });
    }

    const formattedLines = lines.map(line => ({
      text: line.text || '',
      size: line.size || 32,
      y: line.y || 20,
    }));

    mqttClient.publishDisplayText(id, formattedLines, duration_sec || 30);

    res.json({ status: 'ok', device: id });
  } catch (e) {
    res.status(400).json({ detail: e.message });
  }
});

module.exports = router;
