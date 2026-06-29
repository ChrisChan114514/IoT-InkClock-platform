"""Word Library API."""

import json
from fastapi import APIRouter, HTTPException
from models.schemas import WordCreate, WordPushRequest
from mqtt_client import mqtt_broker

router = APIRouter(prefix="/api/words", tags=["words"])

# In-memory word store (replace with DB in production)
_words: list[dict] = [
    {
        "id": 1,
        "word": "serendipity",
        "phonetic": "/ˌserənˈdɪpəti/",
        "definition": "the fact of finding interesting or valuable things by chance",
        "example": "Finding this cafe was pure serendipity.",
        "level": "C1",
        "tags": ["vocabulary"],
    },
    {
        "id": 2,
        "word": "ephemeral",
        "phonetic": "/ɪˈfemərəl/",
        "definition": "lasting for a very short time",
        "example": "The ephemeral beauty of cherry blossoms.",
        "level": "C1",
        "tags": ["nature", "time"],
    },
    {
        "id": 3,
        "word": "ubiquitous",
        "phonetic": "/juːˈbɪkwɪtəs/",
        "definition": "present, appearing, or found everywhere",
        "example": "Smartphones have become ubiquitous in modern life.",
        "level": "B2",
        "tags": ["technology"],
    },
]
_next_id = 4


@router.get("")
def list_words(level: str = "", search: str = "", limit: int = 20):
    """List words, optionally filtered by level or search."""
    result = _words
    if level:
        result = [w for w in result if w["level"] == level]
    if search:
        s = search.lower()
        result = [w for w in result if s in w["word"].lower() or s in w["definition"].lower()]
    return {"words": result[:limit], "total": len(result)}


@router.post("")
def add_word(req: WordCreate):
    """Add a new word to the library."""
    global _next_id
    word_data = {
        "id": _next_id,
        "word": req.word,
        "phonetic": req.phonetic,
        "definition": req.definition,
        "example": req.example,
        "level": req.level,
        "tags": json.dumps(req.tags),
    }
    _words.append(word_data)
    _next_id += 1
    return {"status": "ok", "word": word_data}


@router.post("/push")
def push_word(req: WordPushRequest):
    """Push a word to specified devices."""
    word = next((w for w in _words if w["id"] == req.word_id), None)
    if not word:
        raise HTTPException(404, "Word not found")

    for device_id in req.device_ids:
        mqtt_broker.publish_word(device_id, {
            "word": word["word"],
            "phonetic": word["phonetic"],
            "definition": word["definition"],
            "example": word["example"],
            "level": word["level"],
        })

    return {
        "status": "ok",
        "pushed_word": word["word"],
        "devices": req.device_ids,
    }


@router.get("/{word_id}")
def get_word(word_id: int):
    """Get a single word."""
    word = next((w for w in _words if w["id"] == word_id), None)
    if not word:
        raise HTTPException(404, "Word not found")
    return word
