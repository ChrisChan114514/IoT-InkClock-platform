/**
 * ClockMQTT — Aedes MQTT Broker
 * ================================
 * Pure Node.js MQTT 3.1.1 broker for the InkPad IoT clock system.
 *
 *   MQTT TCP:    port 2082
 *   WebSocket:   port 2091 (for frontend console)
 *
 * Auth: username=device_id, password=device_key
 * ACL:  admin → readwrite inkpad/#
 *       devices → read inkpad/{own_id}/#, write inkpad/{own_id}/status
 *
 * Usage:
 *   npm install && npm start
 *
 * Server: 120.26.111.75
 */

const aedes = require('aedes')();
const net = require('net');
const http = require('http');
const ws = require('websocket-stream');

// ============================================================================
// User / Device Credentials
// ============================================================================

const USERS = {
  // Admin (Web Console)
  admin: {
    password: 'admin123', // CHANGE IN PRODUCTION
    roles: ['admin'],
  },
  // Devices
  Clock1: {
    password: 'changeme_clock1_key_32chars', // CHANGE IN PRODUCTION
    roles: ['device'],
  },
  // Add more devices here:
  // Clock2: { password: '...', roles: ['device'] },
};

// ============================================================================
// Authentication
// ============================================================================

aedes.authenticate = function (client, username, password, callback) {
  const user = USERS[username];
  if (!user) {
    const err = new Error('Bad username');
    err.returnCode = 4; // Bad username or password
    return callback(err, false);
  }

  // Password is passed as Buffer by Aedes
  const pw = Buffer.isBuffer(password) ? password.toString() : password;
  if (pw !== user.password) {
    const err = new Error('Bad password');
    err.returnCode = 4;
    return callback(err, false);
  }

  // Attach roles to client for ACL
  client._clockmqtt_user = username;
  client._clockmqtt_roles = user.roles;

  callback(null, true);
  console.log(`[AUTH] ${username} connected (roles: ${user.roles.join(',')})`);
};

// ============================================================================
// ACL — Authorize Publish
// ============================================================================

aedes.authorizePublish = function (client, packet, callback) {
  const username = client && client._clockmqtt_user;
  const roles = client && client._clockmqtt_roles;

  // Unauthenticated — reject
  if (!username || !roles) {
    return callback(new Error('Not authenticated'));
  }

  // Admin can publish anywhere
  if (roles.includes('admin')) {
    return callback(null);
  }

  // Devices can only publish to their own status topic
  if (roles.includes('device')) {
    const allowed = `inkpad/${username}/status`;
    if (packet.topic === allowed) {
      return callback(null);
    }
    console.log(`[ACL DENY] PUB ${username} → ${packet.topic} (only ${allowed} allowed)`);
    return callback(new Error('Publish denied: only own status topic'));
  }

  return callback(new Error('Publish denied'));
};

// ============================================================================
// ACL — Authorize Subscribe
// ============================================================================

aedes.authorizeSubscribe = function (client, sub, callback) {
  const username = client && client._clockmqtt_user;
  const roles = client && client._clockmqtt_roles;

  if (!username || !roles) {
    return callback(new Error('Not authenticated'));
  }

  // Admin can subscribe anywhere
  if (roles.includes('admin')) {
    return callback(null, sub);
  }

  // Devices can only subscribe to their own downstream topics
  if (roles.includes('device')) {
    const prefix = `inkpad/${username}/`;
    if (sub.topic === prefix + '#' || sub.topic.startsWith(prefix)) {
      return callback(null, sub);
    }
    console.log(`[ACL DENY] SUB ${username} → ${sub.topic} (only ${prefix}# allowed)`);
    return callback(new Error('Subscribe denied: only own topics'));
  }

  return callback(new Error('Subscribe denied'));
};

// ============================================================================
// Event Logging
// ============================================================================

aedes.on('client', function (client) {
  console.log(`[CLIENT] connected: ${client.id}`);
});

aedes.on('clientDisconnect', function (client) {
  console.log(`[CLIENT] disconnected: ${client.id}`);
});

aedes.on('publish', function (packet, client) {
  if (client) {
    console.log(`[PUB] ${client._clockmqtt_user || '?'} → ${packet.topic} (${packet.payload.length} bytes)`);
  }
});

aedes.on('subscribe', function (subscriptions, client) {
  const subs = subscriptions.map(s => s.topic).join(', ');
  console.log(`[SUB] ${client._clockmqtt_user || '?'} ← ${subs}`);
});

aedes.on('clientError', function (client, err) {
  console.log(`[ERROR] client ${client ? client.id : '?'}: ${err.message}`);
});

aedes.on('connectionError', function (client, err) {
  console.log(`[ERROR] connection ${client ? client.id : '?'}: ${err.message}`);
});

// ============================================================================
// Start Servers
// ============================================================================

const MQTT_PORT = 2082;
const WS_PORT = 2091;

// TCP MQTT server
const tcpServer = net.createServer(aedes.handle);
tcpServer.listen(MQTT_PORT, function () {
  console.log(`[BROKER] Aedes MQTT listening on tcp://0.0.0.0:${MQTT_PORT}`);
});

// WebSocket server (for browser MQTT clients)
const httpServer = http.createServer();
ws.createServer({ server: httpServer }, aedes.handle);
httpServer.listen(WS_PORT, function () {
  console.log(`[BROKER] Aedes WS  listening on ws://0.0.0.0:${WS_PORT}`);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

process.on('SIGINT', () => {
  console.log('\n[BROKER] Shutting down...');
  aedes.close(() => {
    tcpServer.close();
    httpServer.close();
    console.log('[BROKER] Stopped.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n[BROKER] SIGTERM — shutting down...');
  aedes.close(() => {
    tcpServer.close();
    httpServer.close();
    process.exit(0);
  });
});

console.log('══════════════════════════════════════════');
console.log('  ClockMQTT Aedes Broker');
console.log(`  MQTT:  tcp://0.0.0.0:${MQTT_PORT}`);
console.log(`  WS:    ws://0.0.0.0:${WS_PORT}`);
console.log('══════════════════════════════════════════');
