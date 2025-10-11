const fs = require('fs');
const path = require('path');
const axios = require('axios');
const azan = require('adhan');
const moment = require('moment-timezone');

// ------------------ CONFIG ------------------
const DATA_FILE = path.join(__dirname, '../data/userGroupData.json');
const BOT_JID = '923261649609@s.whatsapp.net'; // bot JID (used for bookkeeping only)
const TIMEZONE = 'Asia/Karachi';
const DEFAULT_COORDS = { lat: 33.6844, lon: 73.0479 }; // Islamabad default
const DAILY_HADITH_TIME = '10:00'; // 10:00 local time
const JUMMA_TIME = '10:00'; // Friday 10:00
const MORNING_LABEL = 'صبح بخیر';
const EVENING_LABEL = 'شام بخیر';

// ------------------ MEMORY ------------------
const memory = {
  userCounter: new Map(),
  messages: new Map()
};

// ------------------ DATA FUNCTIONS ------------------
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    // ensure required fields exist
    parsed.groups ||= {};           // groupId -> { coords?, enabled:true }
    parsed.prayerNotified ||= {};   // groupId -> { fajr: date, ... }
    parsed.lastDailyMessage ||= {}; // groupId -> date
    parsed.lastJummaDate ||= {};    // groupId -> date
    parsed.reminders ||= {};        // groupId -> { userId -> [ {time,text,lastSentDate} ] }
    return parsed;
  } catch {
    return {
      groups: {},
      prayerNotified: {},
      lastDailyMessage: {},
      lastJummaDate: {},
      reminders: {}
    };
  }
}

function saveData(d) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
  } catch (err) {
    console.error('[SAVE ERROR]', err);
  }
}

function todayDateString() {
  return moment().tz(TIMEZONE).format('YYYY-MM-DD');
}
function nowTimeString() {
  return moment().tz(TIMEZONE).format('HH:mm');
}

// ------------------ HELPERS ------------------
function ensureGroupRegistered(groupId) {
  const data = loadData();
  if (!data.groups[groupId]) {
    data.groups[groupId] = { coords: DEFAULT_COORDS, enabled: true };
    saveData(data);
  }
}

// Extract plain text (non-media) — used only to update counters and register groups
function extractPlainText(msg) {
  if (!msg || !msg.message) return null;
  const mediaTypes = ['imageMessage', 'videoMessage', 'stickerMessage', 'audioMessage', 'documentMessage'];
  for (const t of mediaTypes) if (msg.message[t]) return null;
  if (typeof msg.message.conversation === 'string') return msg.message.conversation;
  if (msg.message.extendedTextMessage?.text) return msg.message.extendedTextMessage.text;
  if (msg.message.buttonsResponseMessage?.selectedButtonId)
    return msg.message.buttonsResponseMessage.selectedButtonId;
  if (msg.message.listResponseMessage?.title)
    return msg.message.listResponseMessage.title;
  return null;
}

// ------------------ PRAYER TIMES ------------------
function getPrayerTimes(coords = DEFAULT_COORDS) {
  try {
    const date = new Date();
    const coordinates = new azan.Coordinates(coords.lat, coords.lon);
    const params = azan.CalculationMethod.MuslimWorldLeague();
    const times = new azan.PrayerTimes(coordinates, date, params);
    const fmt = dt => moment(dt).tz(TIMEZONE).format('hh:mm A');
    return {
      fajr: fmt(times.fajr),
      dhuhr: fmt(times.dhuhr),
      asr: fmt(times.asr),
      maghrib: fmt(times.maghrib),
      isha: fmt(times.isha)
    };
  } catch (e) {
    console.error('getPrayerTimes error', e);
    return {};
  }
}

// ------------------ RANDOM AYAH ------------------
async function fetchRandomAyah(translation = 'ur.junagarhi') {
  try {
    const res = await axios.get(`https://api.alquran.cloud/v1/ayah/random/${translation}`, { timeout: 8000 });
    const j = res.data;
    if (j?.data) return { ayah: j.data.text, surah: j.data.surah?.englishName || j.data.surah?.name, number: j.data.numberInSurah };
  } catch (e) { /* ignore */ }
  return null;
}

// ------------------ HADITH ------------------
const hadithFallback = [
  'حضرت انس رضی اللہ عنہ سے روایت ہے: "سچا ایمان والا وہ ہے جس کی زبان اور دل میں یکسانی ہو۔"',
  'قاعدۂ نیکی: "دوسروں کے لیے ویسا ہی چاہو جیسا تم اپنے لیے چاہتے ہو۔"',
  'رسول اللہ ﷺ نے فرمایا: "بہترین انسان وہ ہے جو لوگوں کے لیے فائدہ مند ہو۔"'
];

async function fetchHadithRandom() {
  try {
    const res = await axios.get('https://hadith-api.herokuapp.com/api/ahadith/random', { timeout: 7000 });
    if (res.data?.text) return `📜 حدیث:\n\n${res.data.text}\n\n${res.data.reference ? '— ' + res.data.reference : ''}`;
  } catch (e) { /* ignore */ }
  return hadithFallback[Math.floor(Math.random() * hadithFallback.length)];
}

// ------------------ ZIKR / DUA / QUOTES ------------------
const azkarList = [
  'سبحان الله', 'الحمدلله', 'لا اله الا اللہ', 'اللہ اکبر',
  'اللهم صل وسلم على نبینا محمد ﷺ', 'استغفر الله العظيم',
  'لا حول ولا قوة الا بالله', 'رضا و جنت کی دعا'
];

const dailyDuas = [
  'اللّٰهُمَّ اِنِّی اَسْأَلُکَ الْعَفْوَ وَالْعَافِیَةَ۔',
  'اَسْتَغْفِرُاللّٰهَ رَبِّی مِنْ كُلِّ ذَنْبٍ۔',
  'اللّٰہُمَّ اِنِّیْ اَسْأَلُکَ رِضَاکَ وَالْجَنَّةَ۔',
  'اللہ ہمیں صبر اور حکمت عطا فرمائے۔',
  'اللہ ہماری نماز اور عبادات قبول فرمائے۔'
];

const islamicQuotes = [
  'اللّٰہ جسے چاہے عزت دے، جسے چاہے آزمائے۔',
  'صبر ایمان کا آدھا حصہ ہے۔',
  'دعا مومن کا ہتھیار ہے۔',
  'اللہ کی رحمت ہر چیز پر غالب ہے۔',
  'نیکی اور صدقہ دل کو سکون دیتا ہے۔'
];

// ------------------ Hijri helper (returns object with month number if possible) ------------------
async function getHijriInfo() {
  try {
    const gDate = moment().tz(TIMEZONE).format('DD-MM-YYYY');
    const res = await axios.get(`https://api.aladhan.com/v1/gToH?date=${gDate}`, { timeout: 7000 });
    if (res.data?.data?.hijri) {
      const h = res.data.data.hijri;
      return { day: h.day, month: h.month?.number || null, monthName: h.month?.en || h.month?.ar, year: h.year };
    }
  } catch (e) { /* ignore */ }
  return null;
}

// ------------------ QIBLA (geocode + qibla) - optional kept for internal use ------------------
async function geocodeCity(city) {
  try {
    const url = `https://nominatim.openstreetmap.org/search`;
    const res = await axios.get(url, { params: { q: city, format: 'json', limit: 1 }, timeout: 7000 });
    if (Array.isArray(res.data) && res.data.length > 0) {
      const obj = res.data[0];
      return { lat: parseFloat(obj.lat), lon: parseFloat(obj.lon), display_name: obj.display_name };
    }
  } catch (e) { /* ignore */ }
  return null;
}
async function getQiblaDirection(lat, lon) {
  try {
    const res = await axios.get(`https://api.aladhan.com/v1/qibla/${lat}/${lon}`, { timeout: 7000 });
    if (res.data?.data) return { direction: res.data.data.direction, distance: res.data.data.distance };
  } catch (e) { /* ignore */ }
  return null;
}

// ------------------ PRAYER MESSAGE BUILDERS ------------------
function buildMorningMessage(hijriStr, ayahOrDua) {
  const g = moment().tz(TIMEZONE).format('DD MMMM YYYY');
  let lines = [];
  lines.push(`${MORNING_LABEL} 🌅`);
  if (hijriStr) lines.push(`📅 اسلامی: ${hijriStr}`);
  lines.push(`🗓️ عیسوی: ${g}`);
  if (ayahOrDua) lines.push(`\n${ayahOrDua}`);
  return lines.join('\n');
}
function buildEveningMessage(ayahOrHadith) {
  const g = moment().tz(TIMEZONE).format('DD MMMM YYYY');
  let lines = [];
  lines.push(`${EVENING_LABEL} 🌇`);
  lines.push(`🗓️ عیسوی: ${g}`);
  if (ayahOrHadith) lines.push(`\n${ayahOrHadith}`);
  return lines.join('\n');
}
function buildPrayerReminderText(prayerName, prayerTime) {
  return `🔔 یاددہانی: ${prayerName} کا وقت (${prayerTime})\nبراہ کرم نماز کے لیے تیار ہو جائیں۔`;
}

// ------------------ SENDING JOBS ------------------
async function sendMorningToGroup(sock, chatId) {
  try {
    const hijri = await getHijriInfo();
    const hijriStr = hijri ? `${hijri.day} ${hijri.monthName} ${hijri.year} AH` : null;
    const ay = await fetchRandomAyah().catch(()=>null);
    const ayText = ay ? `📖 آیت:\n${ay.ayah}\n— سورہ ${ay.surah} (${ay.number})` : `🤲 دعا:\n${dailyDuas[Math.floor(Math.random() * dailyDuas.length)]}`;
    const msg = buildMorningMessage(hijriStr, ayText);
    await sock.sendMessage(chatId, { text: msg });
  } catch (e) {
    console.error('sendMorningToGroup error', e);
  }
}

async function sendEveningToGroup(sock, chatId) {
  try {
    const hadith = await fetchHadithRandom().catch(()=>null);
    const quote = islamicQuotes[Math.floor(Math.random() * islamicQuotes.length)];
    const body = hadith ? `${hadith}\n\n${quote}` : quote;
    const msg = buildEveningMessage(body);
    await sock.sendMessage(chatId, { text: msg });
  } catch (e) {
    console.error('sendEveningToGroup error', e);
  }
}

async function sendDailyHadithToGroup(sock, chatId) {
  try {
    const had = await fetchHadithRandom();
    await sock.sendMessage(chatId, { text: `📜 حدیثِ روز:\n\n${had}` });
  } catch (e) {
    console.error('sendDailyHadithToGroup error', e);
  }
}

async function sendJummaToGroup(sock, chatId) {
  try {
    const had = await fetchHadithRandom();
    const durood = azkarList[Math.floor(Math.random() * azkarList.length)];
    const msg = `📿 جمعہ مبارک!\n\nدرود:\n${durood}\n\n${had}\n\n🌿 دعا ہے کہ آپ کو جمعہ کی برکتیں نصیب ہوں۔`;
    await sock.sendMessage(chatId, { text: msg });
  } catch (e) {
    console.error('sendJummaToGroup error', e);
  }
}

async function sendPrayerReminder(sock, chatId, prayerName, prayerTime) {
  try {
    const txt = buildPrayerReminderText(prayerName, prayerTime);
    await sock.sendMessage(chatId, { text: txt });
  } catch (e) {
    console.error('sendPrayerReminder error', e);
  }
}

// ------------------ INTERNAL SCHEDULER JOBS ------------------
async function runScheduledJobs(sock) {
  try {
    const data = loadData();
    const timeNow = nowTimeString();
    const today = todayDateString();

    // For every registered group
    for (const [chatId, meta] of Object.entries(data.groups || {})) {
      if (!meta.enabled) continue;
      const coords = (meta.coords && meta.coords.lat && meta.coords.lon) ? meta.coords : DEFAULT_COORDS;
      const prayers = getPrayerTimes(coords); // returns hh:mm A strings

      // Convert prayer times to HH:mm
      const prayerMap = {};
      for (const k of ['fajr','dhuhr','asr','maghrib','isha']) {
        if (prayers[k]) prayerMap[k] = moment(prayers[k], 'hh:mm A').format('HH:mm');
      }

      // 1) Send morning message at Fajr (once per day per group)
      if (prayerMap.fajr && timeNow === prayerMap.fajr) {
        const last = data.lastDailyMessage[chatId];
        if (last !== today) {
          await sendMorningToGroup(sock, chatId);
          data.lastDailyMessage[chatId] = today;
        }
      }

      // 2) Send evening message at Maghrib (once per day per group)
      if (prayerMap.maghrib && timeNow === prayerMap.maghrib) {
        // avoid duplicate with daily message same day (we use separate record if needed)
        const keyEven = `even_${chatId}`;
        if (data[keyEven] !== today) {
          await sendEveningToGroup(sock, chatId);
          data[keyEven] = today;
        }
      }

      // 3) Prayer reminders at exact prayer times (and optionally 15-min pre-reminder)
      for (const [pname, ptime] of Object.entries(prayerMap)) {
        // exact-time reminder
        data.prayerNotified[chatId] ||= {};
        if (ptime === timeNow && data.prayerNotified[chatId][pname] !== today) {
          await sendPrayerReminder(sock, chatId, pname, moment(ptime, 'HH:mm').format('hh:mm A'));
          data.prayerNotified[chatId][pname] = today;
        }
        // 15-minute pre-reminder (if applicable)
        const pre = moment(ptime, 'HH:mm').subtract(15, 'minutes').format('HH:mm');
        const preKey = `${pname}_pre`;
        if (pre === timeNow && data.prayerNotified[chatId][preKey] !== today) {
          await sendPrayerReminder(sock, chatId, `${pname} (15 منٹ باقی)`, moment(ptime, 'HH:mm').format('hh:mm A'));
          data.prayerNotified[chatId][preKey] = today;
        }
      }

      // 4) Daily hadith at configured time (10:00)
      if (timeNow === DAILY_HADITH_TIME && data.lastHadithDate !== today) {
        await sendDailyHadithToGroup(sock, chatId);
        data.lastHadithDate = today; // note: shared flag to avoid repeated sends across groups at same minute
      }

      // 5) Jumma: Friday at JUMMA_TIME, once per group per day
      const weekday = moment().tz(TIMEZONE).format('dddd').toLowerCase();
      if ((weekday === 'friday' || weekday === 'جمعہ') && timeNow === JUMMA_TIME) {
        if (data.lastJummaDate[chatId] !== today) {
          await sendJummaToGroup(sock, chatId);
          data.lastJummaDate[chatId] = today;
        }
      }

      // 6) Ramadan mode: if current hijri month == 9, send Sehri/Iftar notices
      const hijri = await getHijriInfo().catch(()=>null);
      if (hijri && parseInt(hijri.month, 10) === 9) {
        // Example: send Sehri reminder 30 minutes before Fajr and Iftar at Maghrib
        if (prayerMap.fajr) {
          const sehriPre = moment(prayerMap.fajr, 'HH:mm').subtract(30, 'minutes').format('HH:mm');
          if (sehriPre === timeNow && data[`sehri_${chatId}`] !== today) {
            await sock.sendMessage(chatId, { text: `🌙 رامضان: سحری ختم ہونے میں 30 منٹ باقی ہیں۔` });
            data[`sehri_${chatId}`] = today;
          }
        }
        if (prayerMap.maghrib && prayerMap.maghrib === timeNow && data[`iftar_${chatId}`] !== today) {
          await sock.sendMessage(chatId, { text: `🌇 افطار کا وقت ہوگیا۔ رمضان مبارک !` });
          data[`iftar_${chatId}`] = today;
        }
      }
    }

    saveData(data);
  } catch (e) {
    console.error('runScheduledJobs error', e);
  }
}

// ------------------ REMINDERS CHECKER (user custom reminders) ------------------
async function checkUserReminders(sock) {
  try {
    const data = loadData();
    const timeNow = nowTimeString();
    const today = todayDateString();
    if (!data.reminders) return;
    for (const [chatId, users] of Object.entries(data.reminders)) {
      for (const [userId, arr] of Object.entries(users)) {
        if (!Array.isArray(arr)) continue;
        for (const r of arr) {
          if (r.time === timeNow && r.lastSentDate !== today) {
            // try private, else group mention
            try {
              await sock.sendMessage(userId, { text: `⏰ یاد دہانی: ${r.text} (وقت: ${r.time})` });
            } catch {
              try { await sock.sendMessage(chatId, { text: `⏰ <@${userId}> آپ کی یاد دہانی: ${r.text}` }); } catch {}
            }
            r.lastSentDate = today;
          }
        }
      }
    }
    saveData(data);
  } catch (e) {
    console.error('checkUserReminders error', e);
  }
}

// ------------------ INTERNAL SCHEDULER ------------------
let _internalRunning = false;
function startInternalScheduler(sock) {
  if (_internalRunning) return;
  _internalRunning = true;
  // run immediately then every minute
  (async function tick() {
    try {
      await runScheduledJobs(sock);
      await checkUserReminders(sock);
    } catch (e) { /* ignore */ }
  })();
  setInterval(async () => {
    try {
      await runScheduledJobs(sock);
      await checkUserReminders(sock);
    } catch (e) { /* ignore */ }
  }, 60 * 1000);
}

// ------------------ ENTRY: handle incoming message (minimal) ------------------
// This function is to be called by host when a message arrives (so we can auto-register groups and update counters).
async function handleIncomingMessage(sock, msg) {
  try {
    const jid = msg.key?.remoteJid;
    if (!jid) return;
    // If group, ensure registered
    if (jid.endsWith('@g.us')) {
      ensureGroupRegistered(jid);
      // optionally update last seen time per group
      const data = loadData();
      data.groups[jid].lastSeen = moment().tz(TIMEZONE).toISOString();
      saveData(data);
    }
    // update user counters
    const plain = extractPlainText(msg);
    if (!plain) return;
    const sender = msg.key?.participant || msg.key?.remoteJid;
    memory.userCounter.set(sender, (memory.userCounter.get(sender) || 0) + 1);
    // DO NOT reply automatically (system is not a chat bot)
  } catch (e) {
    console.error('handleIncomingMessage error', e);
  }
}

// ------------------ EXPORT ------------------
module.exports = {
  startInternalScheduler,
  handleIncomingMessage
};
