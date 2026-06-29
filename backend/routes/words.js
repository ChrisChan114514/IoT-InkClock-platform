/**
 * ClockMQTT — Word Routes
 * ========================
 * /api/words — word library CRUD and push-to-device.
 */

const { Router } = require('express');
const wordStore = require('../wordStore');
const mqttClient = require('../mqttClient');

const router = Router();

// GET /api/words — list words with optional search, level filter
router.get('/', (req, res) => {
  const { search, level, limit } = req.query;
  const result = wordStore.list({ search, level, limit });
  res.json(result);
});

// POST /api/words — add a new word
router.post('/', (req, res) => {
  try {
    const word = wordStore.add(req.body);
    res.json({ status: 'ok', word });
  } catch (e) {
    res.status(400).json({ detail: e.message });
  }
});

// POST /api/words/push — push a word to one or more devices
router.post('/push', (req, res) => {
  try {
    const { word_id, device_ids } = req.body;

    if (!word_id) {
      return res.status(400).json({ detail: 'word_id is required' });
    }
    if (!device_ids || !Array.isArray(device_ids) || device_ids.length === 0) {
      return res.status(400).json({ detail: 'device_ids must be a non-empty array' });
    }

    const word = wordStore.getById(word_id);
    if (!word) {
      return res.status(404).json({ detail: `Word id=${word_id} not found` });
    }

    const wordPayload = {
      word: word.word,
      phonetic: word.phonetic,
      definition: word.definition,
      example: word.example,
      level: word.level,
    };

    for (const deviceId of device_ids) {
      mqttClient.publishWord(deviceId, wordPayload);
    }

    res.json({
      status: 'ok',
      pushed_word: word.word,
      devices: device_ids,
    });
  } catch (e) {
    res.status(400).json({ detail: e.message });
  }
});

// GET /api/words/:id — get single word
router.get('/:id', (req, res) => {
  const word = wordStore.getById(parseInt(req.params.id, 10));
  if (!word) {
    return res.status(404).json({ detail: 'Word not found' });
  }
  res.json(word);
});

module.exports = router;
