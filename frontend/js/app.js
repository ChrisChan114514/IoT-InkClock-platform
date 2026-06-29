/**
 * ClockMQTT — Web Console Frontend
 * Vanilla JS SPA. Talks to backend API at localhost:2081.
 */

const API = "http://" + window.location.hostname + ":2081/api";

// ============================================================================
// Navigation
// ============================================================================

document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const tabId = "tab-" + btn.dataset.tab;
        document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
        document.getElementById(tabId).classList.add("active");

        // Load data when switching tabs
        if (btn.dataset.tab === "dashboard") loadDashboard();
        if (btn.dataset.tab === "devices") loadDevices();
        if (btn.dataset.tab === "words") loadWords();
        if (btn.dataset.tab === "schedules") loadSchedules();
        if (btn.dataset.tab === "system") loadSystem();
    });
});

// ============================================================================
// API helpers
// ============================================================================

async function apiGet(path) {
    const r = await fetch(API + path);
    return r.json();
}

async function apiPost(path, body) {
    const r = await fetch(API + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return r.json();
}

// ============================================================================
// Dashboard
// ============================================================================

async function loadDashboard() {
    try {
        const status = await apiGet("/system/status");
        document.getElementById("dash-online").textContent = status.devices_online + "/" + status.devices_total;
        document.getElementById("dash-words").textContent = status.words_total;
        document.getElementById("dash-scheds").textContent = status.schedules_active;
        document.getElementById("dash-mqtt").textContent = status.mqtt_connected ? "OK" : "DOWN";

        const dot = document.getElementById("mqtt-status");
        dot.className = "status-dot " + (status.mqtt_connected ? "online" : "offline");
    } catch (e) {
        console.error("Dashboard load error:", e);
    }
}

// ============================================================================
// Devices
// ============================================================================

async function loadDevices() {
    try {
        const data = await apiGet("/devices");
        const tbody = document.querySelector("#device-table tbody");
        tbody.innerHTML = data.devices.map(d => `
            <tr>
                <td><strong>${d.device_id}</strong></td>
                <td>${d.device_name}</td>
                <td><span class="${d.online ? 'badge-online' : 'badge-offline'}">${d.online ? '● Online' : '○ Offline'}</span></td>
                <td>${d.rssi ?? '—'}</td>
                <td>${d.fw_ver ?? '—'}</td>
                <td>
                    <button onclick="deleteDevice('${d.device_id}')">Delete</button>
                </td>
            </tr>
        `).join("");
    } catch (e) {
        console.error("Devices load error:", e);
    }
}

async function deleteDevice(deviceId) {
    if (!confirm("Delete " + deviceId + "?")) return;
    await fetch(API + "/devices/" + deviceId, { method: "DELETE" });
    loadDevices();
}
document.getElementById("btn-add-device").addEventListener("click", async () => {
    const id = prompt("Device ID:");
    if (!id) return;
    const name = prompt("Device Name:", id);
    const key = prompt("Device Key (min 8 chars):");
    if (!key || key.length < 8) return alert("Key too short!");
    await apiPost("/devices", { device_id: id, device_name: name || "", device_key: key });
    loadDevices();
});

// ============================================================================
// Words
// ============================================================================

let selectedWordId = null;

async function loadWords() {
    const search = document.getElementById("word-search").value;
    const level = document.getElementById("word-level-filter").value;
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (level) params.set("level", level);

    try {
        const data = await apiGet("/words?" + params.toString());
        const tbody = document.querySelector("#word-table tbody");
        tbody.innerHTML = data.words.map(w => `
            <tr>
                <td><strong>${w.word}</strong> <small>${w.phonetic}</small></td>
                <td>${w.definition}</td>
                <td>${w.level}</td>
                <td><button onclick="selectWord(${w.id}, '${w.word}')">Push</button></td>
            </tr>
        `).join("");

        // Populate device selector for push
        const sel = document.getElementById("word-push-device");
        sel.innerHTML = '<option value="Clock1">Clock1</option>';
    } catch (e) {
        console.error("Words load error:", e);
    }
}

function selectWord(id, word) {
    selectedWordId = id;
    document.getElementById("word-push-area").style.display = "block";
    document.getElementById("word-push-area").querySelector("h3").textContent = "Push: " + word;
}

document.getElementById("word-search").addEventListener("input", loadWords);
document.getElementById("word-level-filter").addEventListener("change", loadWords);

document.getElementById("btn-add-word").addEventListener("click", async () => {
    const word = prompt("Word:");
    if (!word) return;
    const phonetic = prompt("Phonetic:", "");
    const definition = prompt("Definition (English, short):");
    if (!definition) return;
    const example = prompt("Example sentence:", "");
    const level = prompt("CEFR Level (A1-C2):", "B1");
    await apiPost("/words", { word, phonetic, definition, example, level, tags: [] });
    loadWords();
});

document.getElementById("btn-push-word").addEventListener("click", async () => {
    if (!selectedWordId) return alert("Select a word first!");
    const deviceId = document.getElementById("word-push-device").value;
    await apiPost("/words/push", { word_id: selectedWordId, device_ids: [deviceId] });
    alert("Word pushed to " + deviceId);
});

// ============================================================================
// Schedules
// ============================================================================

async function loadSchedules() {
    try {
        const data = await apiGet("/schedules");
        const tbody = document.querySelector("#schedule-table tbody");
        tbody.innerHTML = data.schedules.map(s => `
            <tr>
                <td>${s.title}</td>
                <td>${s.schedule_time}</td>
                <td>${s.schedule_date ?? '—'}</td>
                <td>${s.repeat}</td>
                <td>${s.alert_before_min} min</td>
                <td><button onclick="deleteSchedule(${s.id})">Delete</button></td>
            </tr>
        `).join("");
    } catch (e) {
        console.error("Schedules load error:", e);
    }
}

async function deleteSchedule(id) {
    await fetch(API + "/schedules/" + id, { method: "DELETE" });
    loadSchedules();
}

document.getElementById("btn-add-schedule").addEventListener("click", async () => {
    const title = prompt("Schedule Title (English):");
    if (!title) return;
    const time = prompt("Time (HH:MM):", "09:00");
    const date = prompt("Date (YYYY-MM-DD, blank for repeating):", "");
    const repeat = prompt("Repeat (none/daily/weekday/weekly/monthly):", "none");
    const alertMin = parseInt(prompt("Alert before (min):", "10")) || 10;
    await apiPost("/schedules", {
        title, schedule_time: time,
        schedule_date: date || null,
        repeat, alert_before_min: alertMin,
        device_ids: ["Clock1"],
    });
    loadSchedules();
});

// ============================================================================
// System
// ============================================================================

async function loadSystem() {
    // Static info for now
}

document.getElementById("btn-display-send").addEventListener("click", async () => {
    const text = document.getElementById("display-text").value;
    if (!text) return alert("Enter text!");
    const duration = parseInt(document.getElementById("display-duration").value) || 30;
    await apiPost("/devices/Clock1/command", {
        device_ids: ["Clock1"],
        lines: [{ text, size: 32, y: 20 }],
        duration_sec: duration,
    });
    alert("Display command sent to Clock1");
});

// ============================================================================
// Init
// ============================================================================

loadDashboard();
setInterval(loadDashboard, 30000);  // Refresh every 30s
