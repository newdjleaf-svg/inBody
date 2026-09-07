const express = require('express');
const path = require('path');
const webpush = require('web-push');
const { Pool } = require('pg');
const { DateTime } = require('luxon');

const app = express();
const port = process.env.PORT || 3000;
const publicDir = __dirname;

app.use(express.json({ limit: '512kb' }));

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const pushReady = Boolean(vapidPublicKey && vapidPrivateKey);
if (pushReady) webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined
}) : null;

async function initDb() {
  if (!pool) {
    console.warn('DATABASE_URL 未設定：Web Push 排程 API 將回傳 503。');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_reminders (
      id BIGSERIAL PRIMARY KEY,
      device_id TEXT NOT NULL,
      profile_id INTEGER NOT NULL,
      client_name TEXT DEFAULT '',
      subscription JSONB NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      start_time TEXT NOT NULL DEFAULT '08:00',
      end_time TEXT NOT NULL DEFAULT '22:00',
      interval_minutes INTEGER NOT NULL DEFAULT 60,
      timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
      target_water INTEGER NOT NULL DEFAULT 0,
      next_reminder_at TIMESTAMPTZ,
      last_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(device_id, profile_id)
    );
    CREATE INDEX IF NOT EXISTS idx_push_reminders_due
      ON push_reminders(enabled, next_reminder_at);
  `);
  console.log('PostgreSQL push_reminders ready');
}

function validTime(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(v || ''); }
function validInterval(v) { return [30, 60, 90, 120].includes(Number(v)); }
function safeZone(zone) {
  const z = String(zone || 'Asia/Taipei');
  return DateTime.now().setZone(z).isValid ? z : 'Asia/Taipei';
}

function hmOnDate(base, hm) {
  const [hour, minute] = hm.split(':').map(Number);
  return base.set({ hour, minute, second: 0, millisecond: 0 });
}

function nextReminder(settings, from = DateTime.utc(), initial = false) {
  const zone = safeZone(settings.timezone);
  const start = settings.start_time;
  const end = settings.end_time;
  const interval = Number(settings.interval_minutes);
  let now = from.setZone(zone);
  let startToday = hmOnDate(now, start);
  let endToday = hmOnDate(now, end);

  // 支援跨午夜時段，例如 20:00–01:00。
  const overnight = end <= start;
  let windowStart, windowEnd;
  if (!overnight) {
    if (now < startToday) {
      windowStart = startToday;
      windowEnd = endToday;
    } else if (now <= endToday) {
      windowStart = startToday;
      windowEnd = endToday;
    } else {
      windowStart = startToday.plus({ days: 1 });
      windowEnd = endToday.plus({ days: 1 });
    }
  } else {
    if (now >= startToday) {
      windowStart = startToday;
      windowEnd = endToday.plus({ days: 1 });
    } else if (now <= endToday) {
      windowStart = startToday.minus({ days: 1 });
      windowEnd = endToday;
    } else {
      windowStart = startToday;
      windowEnd = endToday.plus({ days: 1 });
    }
  }

  let candidate;
  if (now < windowStart) {
    candidate = windowStart;
  } else {
    // 初次啟用不立即轟炸通知，從下一個間隔開始；若剛好在開始時間則可在開始時間提醒。
    const elapsed = Math.max(0, Math.floor(now.diff(windowStart, 'minutes').minutes));
    const slot = initial && elapsed === 0 ? 0 : Math.floor(elapsed / interval) + 1;
    candidate = windowStart.plus({ minutes: slot * interval });
  }

  if (candidate > windowEnd) {
    const tomorrowStart = hmOnDate(windowStart.plus({ days: 1 }), start);
    candidate = tomorrowStart;
  }
  return candidate.toUTC().toJSDate();
}

function requirePushConfig(res) {
  if (!pool) { res.status(503).json({ error: 'DATABASE_URL 尚未設定' }); return false; }
  if (!pushReady) { res.status(503).json({ error: 'VAPID 金鑰尚未設定' }); return false; }
  return true;
}

app.get('/api/health', async (_req, res) => {
  let db = false;
  if (pool) { try { await pool.query('SELECT 1'); db = true; } catch {} }
  res.json({ ok: true, db, push: pushReady, time: new Date().toISOString() });
});

app.get('/api/push/public-key', (_req, res) => {
  if (!pushReady) return res.status(503).json({ error: 'VAPID 金鑰尚未設定' });
  res.json({ publicKey: vapidPublicKey });
});

app.post('/api/push/settings', async (req, res) => {
  if (!requirePushConfig(res)) return;
  try {
    const { deviceId, profileId, clientName, subscription, enabled, startTime, endTime, intervalMinutes, timezone, targetWater } = req.body || {};
    if (!deviceId || !subscription?.endpoint || !Number.isInteger(Number(profileId))) return res.status(400).json({ error: '缺少裝置、客戶或 Push subscription' });
    if (!validTime(startTime) || !validTime(endTime) || !validInterval(intervalMinutes)) return res.status(400).json({ error: '提醒時間或間隔格式不正確' });
    const settings = {
      start_time: startTime,
      end_time: endTime,
      interval_minutes: Number(intervalMinutes),
      timezone: safeZone(timezone)
    };
    const next = enabled ? nextReminder(settings, DateTime.utc(), true) : null;
    await pool.query(`
      INSERT INTO push_reminders
        (device_id, profile_id, client_name, subscription, enabled, start_time, end_time, interval_minutes, timezone, target_water, next_reminder_at, updated_at)
      VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,NOW())
      ON CONFLICT (device_id, profile_id) DO UPDATE SET
        client_name=EXCLUDED.client_name,
        subscription=EXCLUDED.subscription,
        enabled=EXCLUDED.enabled,
        start_time=EXCLUDED.start_time,
        end_time=EXCLUDED.end_time,
        interval_minutes=EXCLUDED.interval_minutes,
        timezone=EXCLUDED.timezone,
        target_water=EXCLUDED.target_water,
        next_reminder_at=EXCLUDED.next_reminder_at,
        updated_at=NOW()
    `, [deviceId, Number(profileId), String(clientName || '').slice(0, 80), JSON.stringify(subscription), Boolean(enabled), startTime, endTime, Number(intervalMinutes), settings.timezone, Math.max(0, Math.round(Number(targetWater) || 0)), next]);
    res.json({ ok: true, nextReminderAt: next?.toISOString() || null });
  } catch (e) {
    console.error('push settings error', e);
    res.status(500).json({ error: '儲存提醒設定失敗' });
  }
});

app.post('/api/push/test', async (req, res) => {
  if (!requirePushConfig(res)) return;
  try {
    const { deviceId, profileId } = req.body || {};
    const { rows } = await pool.query('SELECT * FROM push_reminders WHERE device_id=$1 AND profile_id=$2 LIMIT 1', [deviceId, Number(profileId)]);
    if (!rows[0]) return res.status(404).json({ error: '請先儲存喝水提醒設定' });
    const row = rows[0];
    await webpush.sendNotification(row.subscription, JSON.stringify({
      title: '💧 傳奇健康管理學院｜測試通知',
      body: `${row.client_name ? row.client_name + '，' : ''}喝水提醒已成功連線！${row.target_water ? ` 每日建議目標 ${row.target_water.toLocaleString()} cc。` : ''}`,
      tag: `legend-water-test-${row.profile_id}`,
      url: `/?view=lifestyle&profile=${row.profile_id}`
    }));
    res.json({ ok: true });
  } catch (e) {
    console.error('test push error', e);
    if (e.statusCode === 404 || e.statusCode === 410) return res.status(410).json({ error: '此通知權限已失效，請重新啟用通知' });
    res.status(500).json({ error: '測試通知傳送失敗' });
  }
});

app.post('/api/push/disable', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DATABASE_URL 尚未設定' });
  const { deviceId, profileId } = req.body || {};
  await pool.query('UPDATE push_reminders SET enabled=FALSE,next_reminder_at=NULL,updated_at=NOW() WHERE device_id=$1 AND profile_id=$2', [deviceId, Number(profileId)]);
  res.json({ ok: true });
});

let schedulerBusy = false;
async function runPushScheduler() {
  if (!pool || !pushReady || schedulerBusy) return;
  schedulerBusy = true;
  try {
    const { rows } = await pool.query(`
      SELECT * FROM push_reminders
      WHERE enabled=TRUE AND next_reminder_at IS NOT NULL AND next_reminder_at <= NOW()
      ORDER BY next_reminder_at ASC LIMIT 100
    `);
    for (const row of rows) {
      try {
        const target = Number(row.target_water) || 0;
        await webpush.sendNotification(row.subscription, JSON.stringify({
          title: '💧 喝水時間到了',
          body: `${row.client_name ? row.client_name + '，' : ''}補充水分囉！${target ? ` 每日建議目標 ${target.toLocaleString()} cc。` : ''} 建議少量多次慢慢喝。`,
          tag: `legend-water-${row.device_id}-${row.profile_id}`,
          url: `/?view=lifestyle&profile=${row.profile_id}`
        }));
        const next = nextReminder(row, DateTime.utc(), false);
        await pool.query('UPDATE push_reminders SET last_sent_at=NOW(),next_reminder_at=$1,updated_at=NOW() WHERE id=$2', [next, row.id]);
      } catch (e) {
        console.error('scheduled push failed', row.id, e.statusCode || e.message);
        if (e.statusCode === 404 || e.statusCode === 410) {
          await pool.query('UPDATE push_reminders SET enabled=FALSE,next_reminder_at=NULL,updated_at=NOW() WHERE id=$1', [row.id]);
        } else {
          // 暫時性錯誤 5 分鐘後再試，避免每分鐘重複轟炸。
          await pool.query("UPDATE push_reminders SET next_reminder_at=NOW()+INTERVAL '5 minutes',updated_at=NOW() WHERE id=$1", [row.id]);
        }
      }
    }
  } catch (e) {
    console.error('scheduler error', e);
  } finally {
    schedulerBusy = false;
  }
}

app.use(express.static(publicDir, { maxAge: '1h' }));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

initDb().then(() => {
  app.listen(port, '0.0.0.0', () => console.log(`Legend Health v4 running on ${port}`));
  setTimeout(runPushScheduler, 5000);
  setInterval(runPushScheduler, 60 * 1000);
}).catch(err => {
  console.error('Database initialization failed', err);
  process.exit(1);
});
