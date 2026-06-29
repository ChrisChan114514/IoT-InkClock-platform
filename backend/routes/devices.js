/**
 * ClockMQTT — Device Routes
 * ==========================
 * /api/devices — CRUD for device registration and status.
 */

const { Router } = require('express');
const deviceManager = require('../deviceManager');

const router = Router();

// GET /api/devices — list all devices with status
router.get('/', (req, res) => {
  const devices = deviceManager.getAllDevices();
  res.json({ devices, total: devices.length });
});

// POST /api/devices — register a new device
router.post('/', (req, res) => {
  try {
    const { device_id, device_name, device_key } = req.body;

    if (!device_id) {
      return res.status(400).json({ detail: 'device_id is required' });
    }
    if (!device_key || device_key.length < 8) {
      return res.status(400).json({ detail: 'device_key must be at least 8 chars' });
    }

    deviceManager.registerDevice({ device_id, device_name, device_key });

    res.json({
      status: 'ok',
      device_id,
      device_name: device_name || device_id,
      message: 'Device registered. Add credentials to broker/server.js USERS object.',
    });
  } catch (e) {
    res.status(400).json({ detail: e.message });
  }
});

// GET /api/devices/:id — get single device detail
router.get('/:id', (req, res) => {
  const device = deviceManager.getDevice(req.params.id);
  if (!device) {
    // Return default for unknown devices (matches Python behavior)
    return res.json({
      device_id: req.params.id,
      device_name: req.params.id,
      online: false,
      rssi: null,
      fw_ver: null,
    });
  }
  res.json(device);
});

// DELETE /api/devices/:id — remove a device
router.delete('/:id', (req, res) => {
  deviceManager.removeDevice(req.params.id);
  res.json({ status: 'ok', message: `Device ${req.params.id} removed` });
});

module.exports = router;
