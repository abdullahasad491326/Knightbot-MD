// smart_islamic_system_auto.js
// ========================================================
// 🕌 SMART ISLAMIC SYSTEM (PAKISTAN) — AUTO MODE
// Fully automatic: morning/evening/prayer reminders/daily hadith/jumma/ramadan
// No chatbot or manual trigger system
// ========================================================

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const azan = require('adhan');
const moment = require('moment-timezone');

// ------------------ CONFIG ------------------
const DATA_FILE = path.join(__dirname, '../data/userGroupData.json');
const TIMEZONE = 'Asia/Karachi';
const DEFAULT_COORDS = { lat: 33.6844, lon: 73.0479 }; // Islamabad default
const DAILY_HADITH_TIME = '09:00'; // 10:00 local time
const JUMMA_TIME = '01:00'; // Friday 10:00
const MORNING_LABEL = 'صبح بخیر';
const EVENING_LABEL = 'شام بخیر';

// ------------------ DATA FUNCTIONS ------------------
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { groups: {}, prayerNotified: {}, lastDailyMessage: {}, lastJummaDate: {}, reminders: {} };
  }
}

function saveData(d) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
}

function today() {
  return moment().tz(TIMEZONE).format('YYYY-MM-DD');
}
function now() {
  return moment().tz(TIMEZONE).format('HH:mm');
}

function ensureGroup(groupId) {
  const data = loadData();
  if (!data.groups[groupId]) {
    data.groups[groupId] = { coords: DEFAULT_COORDS, enabled: true };
    saveData(data);
  }
}

// ------------------ PRAYER TIMES ------------------
function getPrayerTimes(coords = DEFAULT_COORDS) {
  const date = new Date();
  const coordinates = new azan.Coordinates(coords.lat, coords.lon);
  const params = azan.CalculationMethod.MuslimWorldLeague();
  const times = new azan.PrayerTimes(coordinates, date, params);
  const fmt = t => moment(t).tz(TIMEZONE).format('hh:mm A');
  return {
    fajr: fmt(times.fajr),
    dhuhr: fmt(times.dhuhr),
    asr: fmt(times.asr),
    maghrib: fmt(times.maghrib),
    isha: fmt(times.isha)
  };
}

// ------------------ HADITH & AYAH ------------------
const fallbackHadiths = [
  'رسول اللہ ﷺ نے فرمایا: "بہترین انسان وہ ہے جو لوگوں کے لیے فائدہ مند ہو۔"',
  'حضرت علیؓ: "صبر ایمان کا نصف ہے۔"',
  'مسکراہٹ بھی صدقہ ہے۔'
];

async function fetchHadith() {
  try {
    const r = await axios.get('https://hadith-api.herokuapp.com/api/ahadith/random', { timeout: 7000 });
    return r.data?.text ? r.data.text : fallbackHadiths[Math.floor(Math.random() * fallbackHadiths.length)];
  } catch {
    return fallbackHadiths[Math.floor(Math.random() * fallbackHadiths.length)];
  }
}

async function fetchAyah() {
  try {
    const r = await axios.get('https://api.alquran.cloud/v1/ayah/random/ur.junagarhi', { timeout: 8000 });
    const a = r.data?.data;
    return a ? `📖 ${a.text}\n— سورہ ${a.surah?.name} (${a.numberInSurah})` : null;
  } catch {
    return null;
  }
}

// ------------------ HIJRI ------------------
async function getHijri() {
  try {
    const d = moment().tz(TIMEZONE).format('DD-MM-YYYY');
    const r = await axios.get(`https://api.aladhan.com/v1/gToH?date=${d}`);
    return r.data?.data?.hijri;
  } catch {
    return null;
  }
}

// ------------------ MESSAGE BUILDERS ------------------
function buildMorning(hijri, ayah) {
  const g = moment().tz(TIMEZONE).format('DD MMMM YYYY');
  return `🌅 ${MORNING_LABEL}\n📅 اسلامی: ${hijri?.day || ''} ${hijri?.month?.ar || ''} ${hijri?.year || ''}\n🗓️ ${g}\n\n${ayah || '🤲 اللہ آپ کا دن بابرکت کرے'}`;
}

function buildEvening(hadith) {
  const g = moment().tz(TIMEZONE).format('DD MMMM YYYY');
  return `🌇 ${EVENING_LABEL}\n🗓️ ${g}\n\n📜 حدیث:\n${hadith}`;
}

function buildReminder(name, time) {
  return `🔔 یاددہانی: ${name} کا وقت (${time})\nنماز قائم کریں۔`;
}

// ------------------ SENDER ------------------
async function send(sock, id, text) {
  try {
    await sock.sendMessage(id, { text });
  } catch {}
}

// ------------------ MAIN JOBS ------------------
async function runJobs(sock) {
  const data = loadData();
  const t = now();
  const d = today();

  for (const [id, meta] of Object.entries(data.groups || {})) {
    if (!meta.enabled) continue;
    const prayers = getPrayerTimes(meta.coords);
    const prayerMap = {};
    for (const [k, v] of Object.entries(prayers)) prayerMap[k] = moment(v, 'hh:mm A').format('HH:mm');

    // morning
    if (t === prayerMap.fajr && data.lastDailyMessage[id] !== d) {
      const hijri = await getHijri();
      const ayah = await fetchAyah();
      await send(sock, id, buildMorning(hijri, ayah));
      data.lastDailyMessage[id] = d;
    }

    // evening
    if (t === prayerMap.maghrib && data[`even_${id}`] !== d) {
      const hadith = await fetchHadith();
      await send(sock, id, buildEvening(hadith));
      data[`even_${id}`] = d;
    }

    // prayer reminders
    data.prayerNotified[id] ||= {};
    for (const [name, time] of Object.entries(prayerMap)) {
      if (t === time && data.prayerNotified[id][name] !== d) {
        await send(sock, id, buildReminder(name, moment(time, 'HH:mm').format('hh:mm A')));
        data.prayerNotified[id][name] = d;
      }
      const pre = moment(time, 'HH:mm').subtract(15, 'minutes').format('HH:mm');
      if (t === pre && data.prayerNotified[id][`${name}_pre`] !== d) {
        await send(sock, id, buildReminder(`${name} (15 منٹ باقی)`, moment(time, 'HH:mm').format('hh:mm A')));
        data.prayerNotified[id][`${name}_pre`] = d;
      }
    }

    // daily hadith
    if (t === DAILY_HADITH_TIME && data.lastHadithDate !== d) {
      const h = await fetchHadith();
      await send(sock, id, `📜 حدیثِ روز:\n${h}`);
      data.lastHadithDate = d;
    }

    // Jumma
    const weekday = moment().tz(TIMEZONE).format('dddd').toLowerCase();
    if (weekday === 'friday' && t === JUMMA_TIME && data.lastJummaDate[id] !== d) {
      const h = await fetchHadith();
      await send(sock, id, `📿 جمعہ مبارک!\n\n${h}\n🌿 دعا ہے کہ آپ کو جمعہ کی برکتیں نصیب ہوں۔`);
      data.lastJummaDate[id] = d;
    }
  }

  saveData(data);
}

// ------------------ SCHEDULER ------------------
let running = false;
function startAutoSystem(sock) {
  if (running) return;
  running = true;
  runJobs(sock);
  setInterval(() => runJobs(sock), 60000);
}

// ------------------ MESSAGE HANDLER ------------------
async function handleMessage(sock, msg) {
  try {
    const jid = msg.key?.remoteJid;
    if (!jid) return;
    if (jid.endsWith('@g.us')) ensureGroup(jid);
  } catch {}
}

// ------------------ EXPORT ------------------
module.exports = {
  startAutoSystem,
  handleMessage
};
