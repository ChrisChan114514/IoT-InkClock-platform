/**
 * ClockMQTT — Schedule Routes
 * ============================
 * /api/schedules — schedule CRUD with MQTT push.
 */

const { Router } = require('express');
const scheduleStore = require('../scheduleStore');
const mqttClient = require('../mqttClient');

const router = Router();

// GET /api/schedules — list schedules, optionally filtered by device
router.get('/', (req, res) => {
  const result = scheduleStore.list(req.query.device_id || null);
  res.json(result);
});

// POST /api/schedules — create a new schedule and push to devices
router.post('/', (req, res) => {
  try {
    const schedule = scheduleStore.create(req.body);

    // Push schedule update to all assigned devices
    if (schedule.device_ids && schedule.device_ids.length > 0) {
      const allSchedules = scheduleStore.list().schedules;
      // Push per-device: each device gets all schedules targeting it
      for (const deviceId of schedule.device_ids) {
        const deviceSchedules = allSchedules.filter(s =>
          s.device_ids && s.device_ids.includes(deviceId)
        );
        mqttClient.publishSchedule(deviceId, deviceSchedules);
      }
    }

    res.json({ status: 'ok', schedule });
  } catch (e) {
    res.status(400).json({ detail: e.message });
  }
});

// PUT /api/schedules/:id — update a schedule
router.put('/:id', (req, res) => {
  try {
    const schedule = scheduleStore.update(parseInt(req.params.id, 10), req.body);
    if (!schedule) {
      return res.status(404).json({ detail: 'Schedule not found' });
    }

    // Push updated schedule list to devices
    if (schedule.device_ids && schedule.device_ids.length > 0) {
      const allSchedules = scheduleStore.list().schedules;
      for (const deviceId of schedule.device_ids) {
        const deviceSchedules = allSchedules.filter(s =>
          s.device_ids && s.device_ids.includes(deviceId)
        );
        mqttClient.publishSchedule(deviceId, deviceSchedules);
      }
    }

    res.json({ status: 'ok', schedule });
  } catch (e) {
    res.status(400).json({ detail: e.message });
  }
});

// DELETE /api/schedules/:id — delete a schedule
router.delete('/:id', (req, res) => {
  const deleted = scheduleStore.delete(parseInt(req.params.id, 10));
  if (!deleted) {
    return res.status(404).json({ detail: 'Schedule not found' });
  }
  res.json({ status: 'ok' });
});

module.exports = router;
