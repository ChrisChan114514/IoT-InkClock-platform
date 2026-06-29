#!/usr/bin/env node
/**
 * ClockMQTT — Web Console Backend (Node.js)
 * ===========================================
 * Express server providing REST API for device management,
 * word library, schedule management, and system control.
 *
 * Server: 120.26.111.75
 * API Port: 2081
 * MQTT Broker: Aedes (localhost:2082)
 *
 * Replaces the Python FastAPI backend with Node.js/Express.
 *
 * Usage:
 *   node server.js          # production
 *   node --watch server.js  # dev mode
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const mqttClient = require('./mqttClient');
const deviceManager = require('./deviceManager');

const devicesRouter   = require('./routes/devices');
const wordsRouter     = require('./routes/words');
const schedulesRouter = require('./routes/schedules');
const systemRouter    = require('./routes/system');

const app = express();
const PORT = 2081;

// ===========================================================================
// Middleware
// ===========================================================================

app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// ===========================================================================
// API Routes (must be registered before static files)
// ===========================================================================

app.use('/api/devices',   devicesRouter);
app.use('/api/words',     wordsRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api',           systemRouter);  // /api/health, /api/system/status, /api/auth/login, /api/devices/:id/command

// ===========================================================================
// Static Frontend (served in production; must be after API routes)
// ===========================================================================

const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir, { index: 'index.html' }));
console.log(`[STATIC] Frontend served from: ${frontendDir}`);

// ===========================================================================
// Global Error Handler
// ===========================================================================

app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ detail: 'Invalid JSON in request body' });
  }
  res.status(err.status || 500).json({ detail: err.message || 'Internal server error' });
});

// ===========================================================================
// Startup — Critical Ordering
// ===========================================================================

async function start() {
  console.log('══════════════════════════════════════════');
  console.log('  ClockMQTT Web Console (Node.js)');
  console.log('  MQTT Broker: Aedes @ localhost:2082');
  console.log('  API Server:  0.0.0.0:2081');
  console.log('══════════════════════════════════════════');

  // Step 1: Register MQTT handlers BEFORE connecting
  //         (prevents race: no message arrives without a handler)

  // Presence handler — the BROKER publishes retained messages on connect/disconnect.
  // This is the authoritative source for online/offline (NOT the device's self-reported status).
  mqttClient.onTopic('inkpad/+/presence', (topic, payload) => {
    const parts = topic.split('/');
    if (parts.length >= 3) {
      const deviceId = parts[1];
      try {
        const data = JSON.parse(payload);
        const { justCameOnline } = deviceManager.updatePresence(deviceId, data.connected);

        // Auto-publish time sync when device just came online
        if (justCameOnline) {
          const now = new Date();
          const timestamp = Math.floor(now.getTime() / 1000);
          mqttClient.publishTimeSync(deviceId, timestamp);
        }
      } catch (e) {
        // Ignore bad JSON
      }
    }
  });

  // Status handler — device publishes rssi/fw_ver metadata.
  // The "online" field from the device is IGNORED — presence is authoritative.
  mqttClient.onTopic('inkpad/+/status', (topic, payload) => {
    const parts = topic.split('/');
    if (parts.length >= 3) {
      const deviceId = parts[1];
      try {
        const data = JSON.parse(payload);
        deviceManager.updateMetadata(deviceId, data);
      } catch (e) {
        // Ignore bad JSON
      }
    }
  });

  // Step 2: Connect to MQTT broker
  mqttClient.connect();

  // Step 3: Start heartbeat checker
  deviceManager.startHeartbeat();

  // Step 4: Start HTTP server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[HTTP] API server listening on http://0.0.0.0:${PORT}`);
  });
}

// ===========================================================================
// Shutdown
// ===========================================================================

async function shutdown() {
  console.log('\nShutting down...');
  deviceManager.stopHeartbeat();
  mqttClient.disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Go!
start();
