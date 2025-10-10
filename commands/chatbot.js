const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const azan = require('adhan');
const moment = require('moment-timezone');
const axios = require('axios');

const USER_GROUP_DATA = path.join(__dirname, '../data/userGroupData.json');
const chatMemory = { messages: new Map(), userInfo: new Map(), counter: {} };

// ----------------- Data load/save -----------------
function loadData() {
  try {
    const d = JSON.parse(fs.readFileSync(USER_GROUP_DATA));
    return {
      chatbot: d.chatbot || {},
      prayerNotified: d.prayerNotified || {},
      dailyAyah: d.dailyAyah || {},
      dailyAyahDate: d.dailyAyahDate || {},
      announcements: d.announcements || {},
    };
  } catch {
    return { chatbot: {}, prayerNotified: {}, dailyAyah: {}, dailyAyahDate: {}, announcements: {} };
  }
}

function saveData(d) {
  try { fs.writeFileSync(USER_GROUP_DATA, JSON.stringify(d, null, 2)); }
  catch (err) { console.error('[DATA SAVE ERROR]', err); }
}

// ----------------- Helpers -----------------
function todayDateString() { return moment().tz('Asia/Karachi').format('YYYY-MM-DD'); }

// ----------------- Prayer times -----------------
function getPrayerTimes(coords = { lat: 31.582045, lon: 74.329376 }) {
  try {
    const date = new Date();
    const coordinates = new azan.Coordinates(coords.lat, coords.lon);
    const params = azan.CalculationMethod.MuslimWorldLeague();
    const times = new azan.PrayerTimes(coordinates, date, params);

    const fmt = dt => moment(dt).tz('Asia/Karachi').format('hh:mm A');
    return {
      fajr: fmt(times.fajr),
      dhuhr: fmt(times.dhuhr),
      asr: fmt(times.asr),
      maghrib: fmt(times.maghrib),
      isha: fmt(times.isha),
    };
  } catch { return {}; }
}

// ----------------- Auto Azan Notifier -----------------
async function autoAzanNotifier(sock, chatId, coords) {
  const data = loadData();
  if (!data.prayerNotified[chatId]) data.prayerNotified[chatId] = {};

  const currentTime = moment().tz('Asia/Karachi').format('HH:mm');
  const prayers = getPrayerTimes(coords);

  for (let [key, val] of Object.entries(prayers)) {
    const prayerTime = moment(val, 'hh:mm A').format('HH:mm');
    if (prayerTime === currentTime && data.prayerNotified[chatId][key] !== todayDateString()) {
      data.prayerNotified[chatId][key] = todayDateString();
      saveData(data);
      const prayerNames = { fajr: 'فجر', dhuhr: 'ظہر', asr: 'عصر', maghrib: 'مغرب', isha: 'عشاء' };
      await sock.sendMessage(chatId, { text: `🕌 ${prayerNames[key]} کی اذان کا وقت ہوگیا ہے!\nاللہ اکبر 🤲\n(وقت: ${val})` });
    }
  }
}

// ----------------- Greetings & Messages -----------------
function greetingMessage() {
  const h = moment().tz('Asia/Karachi').hour();
  const day = moment().tz('Asia/Karachi').day();
  if (day === 5 && h >= 11 && h < 16) return '🌸 جمعہ مبارک 🌸\nاللّٰہ ہمیں اپنے ذکر سے منور کرے 🤲';
  if (h >= 5 && h < 11) return '🌅 السلام علیکم! صبح بخیر ❤️\nاللہ آپ کا دن برکتوں سے بھر دے۔';
  if (h >= 22 || h < 5) return '🌙 شب بخیر 🌙\nاللہ آپ کو سکون اور نیک خواب عطا فرمائے۔';
  return null;
}

const dailyDuas = [
  '🤲 اللّٰهُمَّ اِنِّی اَسْأَلُکَ الْعَفْوَ وَالْعَافِیَةَ۔',
  '🕊️ اَسْتَغْفِرُاللّٰهَ رَبِّی مِنْ كُلِّ ذَنْبٍ۔',
  '💫 اللّٰہُمَّ اِنِّیْ اَسْأَلُکَ رِضَاکَ وَالْجَنَّةَ۔',
];

const islamicQuotes = [
  '✨ اللّٰہ جسے چاہے عزت دے، جسے چاہے آزمائے۔',
  '🤍 صبر ایمان کا آدھا حصہ ہے۔',
  '💫 دعا مومن کا ہتھیار ہے۔',
];

// ----------------- Random Ayah -----------------
async function fetchRandomAyah(translation = 'ur.junagarhi') {
  try {
    const res = await fetch(`https://api.alquran.cloud/v1/ayah/random/${translation}`);
    const j = await res.json();
    if (j?.data) return { ayah: j.data.text, surah: j.data.surah?.englishName || j.data.surah?.name, number: j.data.numberInSurah };
  } catch {}
  return null;
}

// ----------------- Hijri Date -----------------
async function fetchHijriDate() {
  try {
    const url = `http://api.aladhan.com/v1/gToH?date=${moment().tz('Asia/Karachi').format('DD-MM-YYYY')}`;
    const res = await fetch(url);
    const j = await res.json();
    return j?.data?.hijri;
  } catch { return null; }
}

// ----------------- AI Reply -----------------
async function getAIReply(userMessage) {
  try {
    const res = await axios.get(`https://api.dreaded.site/api/chatgpt?text=${encodeURIComponent(userMessage)}`);
    return res.data?.result?.prompt || '❌ جواب حاصل نہیں ہو سکا۔';
  } catch { return '⚠️ سرور سے رابطہ نہیں۔'; }
}

// ----------------- Command Handler -----------------
async function handleChatbotCommand(sock, chatId, msg, match, fullText = '') {
  const data = loadData();
  if (!chatId.endsWith('@g.us')) return sock.sendMessage(chatId, { text: '⚠️ یہ فیچر صرف گروپس کے لیے ہے۔' });

  const parts = fullText.trim().split(' ');
  const cmd = parts[0];
  const arg = parts.slice(1).join(' ');

  if (match === 'on') { data.chatbot[chatId] = true; saveData(data); return sock.sendMessage(chatId, { text: '✅ چیٹ بوٹ آن ہوگیا — اب میں اردو میں سب کو جواب دوں گا۔' }); }
  if (match === 'off') { delete data.chatbot[chatId]; saveData(data); return sock.sendMessage(chatId, { text: '❌ چیٹ بوٹ بند کر دیا گیا۔' }); }

  if (cmd === '.announce') { 
    if (!arg) return sock.sendMessage(chatId, { text: 'استعمال: .announce پیغام' }); 
    data.announcements[chatId] = { text: arg, time: new Date().toISOString() }; saveData(data); 
    return sock.sendMessage(chatId, { text: `📢 اعلان:\n\n${arg}` }); 
  }

  if (cmd === '.dailyayah') { 
    if (arg === 'on') { data.dailyAyah[chatId] = true; saveData(data); return sock.sendMessage(chatId, { text: '🕋 روزانہ آیت آن کر دی گئی۔' }); } 
    if (arg === 'off') { delete data.dailyAyah[chatId]; saveData(data); return sock.sendMessage(chatId, { text: '🕋 روزانہ آیت بند کر دی گئی۔' }); } 
  }

  if (cmd === '.hijri') { 
    const h = await fetchHijriDate(); 
    if (!h) return sock.sendMessage(chatId, { text: '⚠️ ہجری تاریخ حاصل نہیں ہو سکی۔' }); 
    return sock.sendMessage(chatId, { text: `📅 آج کی ہجری تاریخ:\n${h.day} ${h.month?.ar} ${h.year}` }); 
  }

  return sock.sendMessage(chatId, { text: 'کمانڈز:\n.chatbot on / off\n.announce پیغام\n.dailyayah on/off\n.hijri تاریخ' });
}

// ----------------- Chatbot Response -----------------
async function handleChatbotResponse(sock, chatId, msg, userMessage, senderId) {
  const data = loadData();
  if (!data.chatbot[chatId]) return;

  await autoAzanNotifier(sock, chatId);

  // Daily Ayah
  if (data.dailyAyah[chatId] && data.dailyAyahDate[chatId] !== todayDateString()) {
    const ay = await fetchRandomAyah();
    if (ay) { await sock.sendMessage(chatId, { text: `📖 آج کی آیت:\n\n${ay.ayah}\n— سورہ ${ay.surah} (${ay.number})` }); data.dailyAyahDate[chatId] = todayDateString(); saveData(data); }
  }

  // Greetings / Dua / Quotes
  const greet = greetingMessage(); if (greet) await sock.sendMessage(chatId, { text: greet });
  await sock.sendMessage(chatId, { text: dailyDuas[Math.floor(Math.random() * dailyDuas.length)] });
  await sock.sendMessage(chatId, { text: islamicQuotes[Math.floor(Math.random() * islamicQuotes.length)] });

  // Memory
  if (!chatMemory.messages.has(senderId)) chatMemory.messages.set(senderId, []);
  const arr = chatMemory.messages.get(senderId); arr.push(userMessage); if (arr.length > 30) arr.shift();

  // Instant AI reply
  const aiReply = await getAIReply(userMessage);
  await sock.sendMessage(chatId, { text: aiReply }); // ✅ removed "quoted: msg" to stop forwarding / channel info
}

// ----------------- Export -----------------
module.exports = { handleChatbotCommand, handleChatbotResponse };
