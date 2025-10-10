const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const azan = require('adhan');
const moment = require('moment-timezone');

const USER_GROUP_DATA = path.join(__dirname, '../data/userGroupData.json');
const chatMemory = { messages: new Map(), userInfo: new Map(), counter: {} };

// ----------------- Data load/save -----------------
function loadData() {
  try {
    return JSON.parse(fs.readFileSync(USER_GROUP_DATA));
  } catch {
    return {
      chatbot: {},
      prayerNotified: {},
      dailyAyah: {},
      dailyAyahDate: {},
      announcements: {},
    };
  }
}
function saveData(d) {
  fs.writeFileSync(USER_GROUP_DATA, JSON.stringify(d, null, 2));
}

// ----------------- Helpers -----------------
function randomDelay() {
  return Math.floor(Math.random() * 2000) + 1000;
}
async function typing(sock, id) {
  try {
    await sock.presenceSubscribe(id);
    await sock.sendPresenceUpdate('composing', id);
    await new Promise((r) => setTimeout(r, randomDelay()));
  } catch {}
}
function todayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ----------------- Prayer times (Adhan) -----------------
function getPrayerTimes(coords = { lat: 31.582045, lon: 74.329376 }) {
  const date = new Date();
  const coordinates = new azan.Coordinates(coords.lat, coords.lon);
  const params = azan.CalculationMethod.MuslimWorldLeague();
  const times = new azan.PrayerTimes(coordinates, date, params);

  const fmt = (dt) =>
    moment(dt)
      .tz('Asia/Karachi')
      .format('hh:mm A');

  return {
    fajr: fmt(times.fajr),
    dhuhr: fmt(times.dhuhr),
    asr: fmt(times.asr),
    maghrib: fmt(times.maghrib),
    isha: fmt(times.isha),
  };
}

// ----------------- Auto Azan Notifier -----------------
async function autoAzanNotifier(sock, chatId, coords) {
  const data = loadData();
  if (!data.prayerNotified) data.prayerNotified = {};
  if (!data.prayerNotified[chatId]) data.prayerNotified[chatId] = {};

  const now = moment().tz('Asia/Karachi');
  const currentTime = now.format('HH:mm');
  const prayers = getPrayerTimes(coords);

  for (let [key, val] of Object.entries(prayers)) {
    const formatted = moment(val, 'hh:mm A').format('HH:mm');
    if (formatted === currentTime && data.prayerNotified[chatId][key] !== todayDateString()) {
      data.prayerNotified[chatId][key] = todayDateString();
      saveData(data);
      const prayerNames = { fajr: 'فجر', dhuhr: 'ظہر', asr: 'عصر', maghrib: 'مغرب', isha: 'عشاء' };
      await sock.sendMessage(chatId, {
        text: `🕌 ${prayerNames[key]} کی اذان کا وقت ہوگیا ہے!\nاللہ اکبر، اللہ اکبر 🤲\n(وقت: ${val})`,
      });
    }
  }
}

// ----------------- Greetings & Islamic Messages -----------------
function greetingMessage() {
  const h = new Date().getHours();
  const day = new Date().getDay();
  if (day === 5 && h >= 11 && h < 16)
    return '🌸 جمعہ مبارک 🌸\nاللّٰہ ہمیں اپنے ذکر سے منور کرے 🤲';
  if (h >= 5 && h < 11)
    return '🌅 السلام علیکم! صبح بخیر ❤️\nاللہ آپ کا دن برکتوں سے بھر دے۔';
  if (h >= 22 || h < 5)
    return '🌙 شب بخیر 🌙\nاللہ آپ کو سکون اور نیک خواب عطا فرمائے۔';
  return null;
}

const dailyDuas = [
  '🤲 اللّٰهُمَّ اِنِّی اَسْأَلُکَ الْعَفْوَ وَالْعَافِیَةَ۔',
  '🕊️ اَسْتَغْفِرُاللّٰهَ رَبِّی مِنْ كُلِّ ذَنْبٍ۔',
  '💫 اللّٰہُمَّ اِنِّیْ اَسْأَلُکَ رِضَاکَ وَالْجَنَّةَ۔',
  '🌙 رَبِّ زِدْنِی عِلْمًا۔',
  '💖 سُبْحَانَ اللّٰهِ وَبِحَمْدِهِ، سُبْحَانَ اللّٰهِ الْعَظِیْمِ۔',
];

const islamicQuotes = [
  '✨ اللّٰہ جسے چاہے عزت دے، جسے چاہے آزمائے۔',
  '🤍 صبر ایمان کا آدھا حصہ ہے۔',
  '💫 دعا مومن کا ہتھیار ہے۔',
  '🌙 نیکی چھوٹی نہیں ہوتی، نیت بڑی ہوتی ہے۔',
  '🕊️ جو اللّٰہ پر بھروسہ کرے، اللّٰہ اس کے لیے کافی ہے۔',
];

// ----------------- Random Ayah -----------------
async function fetchRandomAyah(translation = 'ur.junagarhi') {
  try {
    const res = await fetch(`https://api.alquran.cloud/v1/ayah/random/${translation}`);
    const json = await res.json();
    if (json?.data) {
      const d = json.data;
      return {
        ayah: d.text,
        surah: d.surah?.englishName || d.surah?.name,
        number: d.numberInSurah,
        tr: d.text,
      };
    }
  } catch (e) {}
  return null;
}

// ----------------- Hijri Date -----------------
async function fetchHijriDate() {
  try {
    const now = moment().tz('Asia/Karachi');
    const url = `http://api.aladhan.com/v1/gToH?date=${now.format('DD-MM-YYYY')}`;
    const res = await fetch(url);
    const data = await res.json();
    return data?.data?.hijri;
  } catch {
    return null;
  }
}

// ----------------- Voice Reply -----------------
async function sendVoiceReply(sock, chatId, text) {
  const url = `https://api.dreaded.site/api/voice?text=${encodeURIComponent(text)}&lang=ur`;
  try {
    await sock.sendMessage(chatId, {
      audio: { url },
      mimetype: 'audio/mpeg',
      ptt: true,
    });
  } catch {}
}

// ----------------- Command Handler -----------------
async function handleChatbotCommand(sock, chatId, msg, match, fullText = '') {
  const data = loadData();

  if (!chatId.endsWith('@g.us')) {
    return sock.sendMessage(chatId, { text: '⚠️ یہ فیچر صرف گروپس کے لیے ہے۔' });
  }

  const parts = fullText.trim().split(' ');
  const cmd = parts[0] || '';
  const arg = parts.slice(1).join(' ').trim();

  if (match === 'on') {
    data.chatbot[chatId] = true;
    saveData(data);
    return sock.sendMessage(chatId, {
      text: '✅ چیٹ بوٹ آن ہوگیا — اب میں اردو میں سب کو جواب دوں گا۔',
    });
  }

  if (match === 'off') {
    delete data.chatbot[chatId];
    saveData(data);
    return sock.sendMessage(chatId, { text: '❌ چیٹ بوٹ بند کر دیا گیا۔' });
  }

  if (cmd === '.announce') {
    if (!arg) return sock.sendMessage(chatId, { text: 'استعمال: .announce پیغام' });
    data.announcements[chatId] = { text: arg, time: new Date().toISOString() };
    saveData(data);
    return sock.sendMessage(chatId, { text: `📢 اعلان:\n\n${arg}` });
  }

  if (cmd === '.dailyayah') {
    if (arg === 'on') {
      data.dailyAyah[chatId] = true;
      saveData(data);
      return sock.sendMessage(chatId, { text: '🕋 روزانہ آیت آن کر دی گئی۔' });
    }
    if (arg === 'off') {
      delete data.dailyAyah[chatId];
      saveData(data);
      return sock.sendMessage(chatId, { text: '🕋 روزانہ آیت بند کر دی گئی۔' });
    }
  }

  if (cmd === '.hijri') {
    const h = await fetchHijriDate();
    if (!h)
      return sock.sendMessage(chatId, {
        text: '⚠️ ہجری تاریخ حاصل کرنے میں دشواری ہوئی۔',
      });
    return sock.sendMessage(chatId, {
      text: `📅 آج کی ہجری تاریخ:\n${h.day} ${h.month?.ar} ${h.year}`,
    });
  }

  return sock.sendMessage(chatId, {
    text: 'کمانڈز:\n.chatbot on / off\n.announce پیغام\n.dailyayah on/off\n.hijri تاریخ',
  });
}

// ----------------- Chatbot Response -----------------
async function handleChatbotResponse(sock, chatId, msg, userMessage, senderId) {
  const data = loadData();
  if (!data.chatbot[chatId]) return;

  await autoAzanNotifier(sock, chatId);

  // Daily Ayah
  if (data.dailyAyah[chatId] && data.dailyAyahDate[chatId] !== todayDateString()) {
    const ay = await fetchRandomAyah();
    if (ay) {
      await sock.sendMessage(chatId, {
        text: `📖 آج کی آیت:\n\n${ay.ayah}\n— سورہ ${ay.surah} (${ay.number})`,
      });
      data.dailyAyahDate[chatId] = todayDateString();
      saveData(data);
    }
  }

  // Greetings / Dua / Quotes
  const greet = greetingMessage();
  if (greet && Math.random() < 0.3) await sock.sendMessage(chatId, { text: greet });
  if (Math.random() < 0.15)
    await sock.sendMessage(chatId, { text: dailyDuas[Math.floor(Math.random() * dailyDuas.length)] });
  if (Math.random() < 0.1)
    await sock.sendMessage(chatId, { text: islamicQuotes[Math.floor(Math.random() * islamicQuotes.length)] });

  // Memory system
  if (!chatMemory.messages.has(senderId)) chatMemory.messages.set(senderId, []);
  const arr = chatMemory.messages.get(senderId);
  arr.push(userMessage);
  if (arr.length > 30) arr.shift();

  await typing(sock, chatId);
  const reply = `💬 آپ نے فرمایا:\n"${userMessage}"\n\nجواب: ان شاءاللہ ہر بات کا حل صبر میں ہے ❤️`;
  await sock.sendMessage(chatId, { text: reply }, { quoted: msg });

  if (Math.random() < 0.2) await sendVoiceReply(sock, chatId, reply);
}

// ----------------- Export -----------------
module.exports = {
  handleChatbotCommand,
  handleChatbotResponse,
};
