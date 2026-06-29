/**
 * ClockMQTT — Word Store
 * =======================
 * In-memory word library with seed data matching the Python backend.
 */

const VALID_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

class WordStore {
  constructor() {
    this._words = [];
    this._nextId = 1;

    // Seed data — identical to Python backend routes/words.py
    this._seed();
  }

  _seed() {
    this.add({
      word: 'serendipity',
      phonetic: '/ˌserənˈdɪpəti/',
      definition: 'The occurrence of events by chance in a happy way',
      example: 'Finding that bookstore was pure serendipity.',
      level: 'C1',
      tags: [],
    });
    this.add({
      word: 'ephemeral',
      phonetic: '/ɪˈfemərəl/',
      definition: 'Lasting for a very short time',
      example: 'The beauty of cherry blossoms is ephemeral.',
      level: 'C1',
      tags: [],
    });
    this.add({
      word: 'ubiquitous',
      phonetic: '/juːˈbɪkwɪtəs/',
      definition: 'Present, appearing, or found everywhere',
      example: 'Smartphones have become ubiquitous in modern life.',
      level: 'B2',
      tags: [],
    });
  }

  /**
   * List words with optional filters.
   * @param {object} opts - { level?, search?, limit? }
   * @returns {{ words: object[], total: number }}
   */
  list(opts = {}) {
    let result = [...this._words];

    if (opts.level) {
      result = result.filter(w => w.level === opts.level);
    }
    if (opts.search) {
      const q = opts.search.toLowerCase();
      result = result.filter(w =>
        w.word.toLowerCase().includes(q) ||
        w.definition.toLowerCase().includes(q)
      );
    }
    if (opts.limit) {
      result = result.slice(0, parseInt(opts.limit, 10));
    }

    return { words: result, total: result.length };
  }

  add(data) {
    if (!data.word || data.word.length > 64) {
      throw new Error('word is required (max 64 chars)');
    }
    if (!data.definition || data.definition.length > 256) {
      throw new Error('definition is required (max 256 chars)');
    }
    const level = data.level || 'B1';
    if (!VALID_LEVELS.has(level)) {
      throw new Error(`level must be one of: ${[...VALID_LEVELS].join(', ')}`);
    }

    const word = {
      id: this._nextId++,
      word: data.word,
      phonetic: data.phonetic || '',
      definition: data.definition,
      example: data.example || '',
      level,
      tags: data.tags || [],
    };
    this._words.push(word);
    return word;
  }

  getById(id) {
    return this._words.find(w => w.id === id) || null;
  }

  count() {
    return this._words.length;
  }
}

// Singleton
module.exports = new WordStore();
