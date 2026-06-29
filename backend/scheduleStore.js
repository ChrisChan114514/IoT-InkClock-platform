/**
 * ClockMQTT — Schedule Store
 * ============================
 * In-memory schedule management.
 */

const VALID_REPEAT = new Set(['none', 'daily', 'weekday', 'weekly', 'monthly']);

class ScheduleStore {
  constructor() {
    this._schedules = [];
    this._nextId = 1;
  }

  list(deviceId) {
    let result = [...this._schedules];
    if (deviceId) {
      result = result.filter(s =>
        s.device_ids && s.device_ids.includes(deviceId)
      );
    }
    return { schedules: result, total: result.length };
  }

  create(data) {
    if (!data.title || data.title.length > 128) {
      throw new Error('title is required (max 128 chars)');
    }
    if (!data.schedule_time) {
      throw new Error('schedule_time is required (HH:MM)');
    }
    const repeat = data.repeat || 'none';
    if (!VALID_REPEAT.has(repeat)) {
      throw new Error(`repeat must be one of: ${[...VALID_REPEAT].join(', ')}`);
    }

    const schedule = {
      id: this._nextId++,
      title: data.title,
      schedule_time: data.schedule_time,
      schedule_date: data.schedule_date || null,
      repeat,
      alert_before_min: data.alert_before_min ?? 10,
      device_ids: data.device_ids || ['Clock1'],
    };
    this._schedules.push(schedule);
    return schedule;
  }

  update(id, data) {
    const idx = this._schedules.findIndex(s => s.id === id);
    if (idx === -1) return null;

    const s = this._schedules[idx];
    if (data.title !== undefined) s.title = data.title;
    if (data.schedule_time !== undefined) s.schedule_time = data.schedule_time;
    if (data.schedule_date !== undefined) s.schedule_date = data.schedule_date;
    if (data.repeat !== undefined) s.repeat = data.repeat;
    if (data.alert_before_min !== undefined) s.alert_before_min = data.alert_before_min;
    if (data.device_ids !== undefined) s.device_ids = data.device_ids;

    return s;
  }

  delete(id) {
    const idx = this._schedules.findIndex(s => s.id === id);
    if (idx === -1) return false;
    this._schedules.splice(idx, 1);
    return true;
  }

  getById(id) {
    return this._schedules.find(s => s.id === id) || null;
  }

  countActive() {
    return this._schedules.length;
  }
}

// Singleton
module.exports = new ScheduleStore();
