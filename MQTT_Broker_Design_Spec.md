




# InkPad MQTT IoT 时钟 — Broker / Web 控制台设计规格

> 版本: v1.2
> 日期: 2026-06-29
> AT 模块: DX-CT02-A&B 4G+BLE (115200/8N1)
> 目标: 英文单词记忆 + 英文日程提醒 + 实时时钟
>
> **服务器**: 120.26.111.75 | **设备**: Clock1

服务	端口	状态
clockmqtt-broker	MQTT TCP :2082, WS :2091	online
clockmqtt-web	FastAPI :2081	online
API 健康检查: {"status":"ok","mqtt_connected":true}

---

## 1. 系统架构概览

```
┌──────────────┐   AT(UART)      ┌──────────────┐   4G/MQTT(TCP)   ┌────────────────┐
│  STM32 InkPad │ ◄─────────────► │  CT02 模块    │ ◄──────────────► │  MQTT Broker   │
│  (设备端)      │  115200/8N1    │  (DX-CT02-A)  │                  │  (Aedes)       │
└──────────────┘                 └──────────────┘                  └───────┬────────┘
                                                                          │
                                                                    ┌─────┴─────┐
                                                                    │ Web 控制台  │
                                                                    └───────────┘
```

**核心功能：**

- **实时时钟**: NTP 网络时间同步 → 墨水屏显示
- **英文单词记忆**: 每日推送英文单词（英英简释 + 例句）
- **英文日程提醒**: 推送英文日程标题 + 时间提醒

**语言策略：全英文内容**（ASCII 全覆盖，无需中文字库，Flash 友好）

---

## 2. 设备标识与安全

### 2.1 设备身份

| 字段           | 说明                             | 示例                |
| -------------- | -------------------------------- | ------------------- |
| `device_id`  | 设备唯一 ID                      | `inkpad_a1b2c3d4` |
| `device_key` | 预共享密钥 (PSK)，用于 MQTT 认证 | 32 字符随机串       |

### 2.2 MQTT 认证

- **用户名**: `device_id`
- **密码**: `device_key`（Broker 端校验）

---

## 3. MQTT Topic 设计

### 3.1 Topic 树

```
inkpad/{device_id}/
├── status                    # 设备 → Broker: 在线状态 + RSSI
├── time/sync                 # Broker → 设备: NTP 时间同步
├── word/daily                # Broker → 设备: 每日单词 (英文)
├── schedule/update           # Broker → 设备: 英文日程更新
├── display/text              # Broker → 设备: 实时文本推送
└── config/set                # Broker → 设备: 远程配置
```

### 3.2 Topic 详细定义

#### `inkpad/{device_id}/status` (QoS 1, Retained)

```
online:  {"online": true,  "rssi": 22, "uptime": 3600, "fw_ver": "1.0.0"}
offline: {"online": false}
```

#### `inkpad/{device_id}/time/sync` (QoS 0)

```json
{
  "timestamp": 1751234567,
  "timezone": "Asia/Shanghai"
}
```

#### `inkpad/{device_id}/word/daily` (QoS 1, Retained)

每日单词 — **纯英文，英英简释**：

```json
{
  "date": "2026-06-29",
  "word": "serendipity",
  "phonetic": "/ˌserənˈdɪpəti/",
  "definition": "the fact of finding interesting or valuable things by chance",
  "example": "Finding this cafe was pure serendipity.",
  "level": "C1"
}
```

字段说明:

- `definition`: **英文简释**（15 词以内），不用中文
- `example`: 英文例句
- `level`: CEFR 等级 (A1-C2)

#### `inkpad/{device_id}/schedule/update` (QoS 1, Retained)

英文日程提醒：

```json
{
  "version": 12,
  "schedules": [
    {
      "id": "sched_001",
      "title": "Team Standup",
      "time": "09:30",
      "date": "2026-06-30",
      "repeat": "weekday",
      "alert_before_min": 10
    },
    {
      "id": "sched_002",
      "title": "Dentist Appt",
      "time": "15:00",
      "date": "2026-07-03",
      "repeat": "none"
    }
  ]
}
```

限制: `title` ≤ 20 字符（ASCII），设备端最多存 **5 条**。

#### `inkpad/{device_id}/display/text` (QoS 1)

实时文本推送（立即显示，超时后恢复时钟界面）：

```json
{
  "lines": [
    {"text": "Meeting in 5 min", "size": 32, "y": 20},
    {"text": "Room 302", "size": 16, "y": 60}
  ],
  "duration_sec": 30
}
```

#### `inkpad/{device_id}/config/set` (QoS 1)

```json
{
  "timezone": "Asia/Shanghai",
  "word_time": "08:00",
  "sync_interval_min": 30
}
```

---

## 4. Web 控制台

### 4.1 页面结构

```
├── Dashboard              # 设备在线数 / 今日推送统计
├── Device Management      # 设备列表、添加/删除、在线状态
├── Word Library           # 单词库 CRUD、批量导入、自动推送规则
├── Schedule Management    # 日程 CRUD、按设备推送
├── Message Log            # 推送历史、成功/失败状态
└── System Settings        # NTP 源、Broker 配置
```

### 4.2 单词库设计

```
word          : "ephemeral"
phonetic      : "/ɪˈfemərəl/"
definition    : "lasting for a very short time"
example       : "The ephemeral beauty of cherry blossoms."
level         : "C1"
tags          : ["nature", "time"]
```

Web 端支持:

- 手动添加 / CSV 批量导入
- 按 CEFR 等级筛选
- 定时推送规则（每天 08:00 推送到全部 / 指定设备）
- 推送历史记录

### 4.3 日程管理设计

```
title              : "Team Standup"
time               : "09:30"
date               : "2026-06-30" (单次) 或 null (重复)
repeat             : "none" | "daily" | "weekday" | "weekly" | "monthly"
alert_before_min   : 10
target_device_ids  : ["inkpad_a1b2c3d4"]
```

---

## 5. 消息时序

### 5.1 设备上电 → 时间同步 → 获取内容

```
STM32+CT02                    Broker                   Web控制台
 │                              │                         │
 │ AT+DEFAULT (恢复出厂)         │                         │
 │ AT+QICSGP=... (配置APN)      │                         │
 │ AT+MQTTCLIENT=...            │                         │
 │ AT+MIPSTART=...              │                         │
 │ AT+MCONNECT=1,60 ──────────►│                         │
 │◄── CONNACK ─────────────────│                         │
 │ SUB time/sync ─────────────►│                         │
 │ SUB word/daily ────────────►│                         │
 │ SUB schedule/update ───────►│                         │
 │ SUB display/text ──────────►│                         │
 │                              │                         │
 │ PUB status {"online":true}─►│── 更新状态 ────────────►│
 │                              │                         │
 │                              │◄── 推送时间 ───────────│
 │◄── PUB time/sync ──────────│                         │
 │                              │◄── Retained 单词 ─────│
 │◄── PUB word/daily ─────────│                         │
 │                              │◄── Retained 日程 ─────│
 │◄── PUB schedule/update ────│                         │
 │                              │                         │
 │ (墨水屏: 时间 + 日期 + 单词)   │                         │
```

### 5.2 每日单词自动推送

```
Web控制台 (每天 08:00)          Broker                   STM32
 │                              │                         │
 │ PUB word/daily ────────────►│                         │
 │   (Retained)                 │                         │
 │                              │── Retained 持久化 ─────│
 │                              │◄── 设备 SUB word/daily │
 │                              │── PUB word/daily ─────►│
 │                              │                         │── 墨水屏显示新单词
```

---

## 6. 安全注意事项

1. **device_key 至少 32 字符随机生成**
2. **ACL 严格隔离**: 设备 A 不可订阅设备 B 的 topic
3. **Broker 连接频率限制**: 单设备 ≤ 1 次 CONNECT/秒
4. **TLS 建议**: 生产环境使用 TLS 1.2+

---

## 7. 运行方式（无 Docker，直接进程）

### 7.1 启动 Aedes MQTT Broker（端口 2080）

```bash
cd ClockMQTT/broker
npm install
npm start          # 生产模式
npm run dev        # 开发模式（--watch）
```

Broker 内建认证与 ACL（见 `broker/server.js` 的 `USERS` 对象），无需外部配置文件。

### 7.2 启动 Web Console（端口 2081）

```bash
cd ClockMQTT/backend
pip install -r requirements.txt
python app.py      # 或: uvicorn app:app --host 0.0.0.0 --port 2081
```

Web Console 通过 `127.0.0.1:2080`（同机）连接 Aedes Broker。

### 7.3 进程管理（推荐 PM2）

```bash
npm install -g pm2
pm2 start broker/server.js --name clockmqtt-broker
pm2 start "uvicorn app:app --host 0.0.0.0 --port 2081" --name clockmqtt-web --interpreter python3
pm2 save
pm2 startup
```

---

## 8. 开发优先级

| 优先级 | 功能                         | 依赖   |
| ------ | ---------------------------- | ------ |
| P0     | Broker 搭建 + 设备 MQTT 认证 | 无     |
| P0     | NTP 时间同步                 | Broker |
| P0     | 实时时钟显示 (STM32 端)      | NTP    |
| P1     | 每日单词推送 (英文)          | Broker |
| P1     | Web 控制台 — 单词库管理     | Broker |
| P1     | 英文日程推送                 | Broker |
| P2     | Web 控制台 — 日程管理       | Broker |
| P2     | 实时文本推送 (display/text)  | Broker |
| P3     | 离线消息补推                 | Broker |
