const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const azan = require('adhan');
const moment = require('moment-timezone');
const axios = require('axios');

const USER_GROUP_DATA = path.join(__dirname, '../data/userGroupData.json');
const chatMemory = { messages: new Map(), userCounter: new Map() };

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
      lastAzkarDate: d.lastAzkarDate || {},
      lastDailyMessage: d.lastDailyMessage || {},
    };
  } catch {
    return {
      chatbot: {},
      prayerNotified: {},
      dailyAyah: {},
      dailyAyahDate: {},
      announcements: {},
      lastAzkarDate: {},
      lastDailyMessage: {},
    };
  }
}

function saveData(d) {
  try { fs.writeFileSync(USER_GROUP_DATA, JSON.stringify(d, null, 2)); }
  catch (err) { console.error('[DATA SAVE ERROR]', err); }
}

// ----------------- Helpers -----------------
function todayDateString() { return moment().tz('Asia/Karachi').format('YYYY-MM-DD'); }

// ----------------- Prayer times (ISLAMABAD) -----------------
function getPrayerTimes(coords = { lat: 33.6844, lon: 73.0479 }) {
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

// ----------------- Auto Azan -----------------
async function autoAzanNotifier(sock, chatId, coords = { lat: 33.6844, lon: 73.0479 }) {
  const data = loadData();
  if (!data.prayerNotified[chatId]) data.prayerNotified[chatId] = {};
  const currentTime = moment().tz('Asia/Karachi').format('HH:mm');
  const prayers = getPrayerTimes(coords);
  const prayerNames = { fajr: 'فجر', dhuhr: 'ظہر', asr: 'عصر', maghrib: 'مغرب', isha: 'عشاء' };
  for (let [key, val] of Object.entries(prayers)) {
    const prayerTime = moment(val, 'hh:mm A').format('HH:mm');
    if (prayerTime === currentTime && data.prayerNotified[chatId][key] !== todayDateString()) {
      data.prayerNotified[chatId][key] = todayDateString();
      saveData(data);
      await sock.sendMessage(chatId, { text: `🕌 ${prayerNames[key]} کی اذان کا وقت ہوگیا ہے!\nاللہ اکبر 🤲\n(وقت: ${val})` });
    }
  }
}

// ----------------- Azkar -----------------
const dailyAzkarList = [
  'سبحان الله',
  'الحمدلله',
  'لا اله الا اللہ',
  'اللہ اکبر',
  'استغفر اللہ',
  'سبحان الله وبحمده',
  'لا حول ولا قوة الا بالله',
];

async function sendAzkar(sock, chatId, data) {
  const azkar = dailyAzkarList[Math.floor(Math.random() * dailyAzkarList.length)];
  await sock.sendMessage(chatId, { text: `🕋 اذکار: ${azkar}۔` });
  data.lastAzkarDate[chatId] = todayDateString();
  saveData(data);
}

// ----------------- Daily Ayah -----------------
async function fetchRandomAyah(translation = 'ur.junagarhi') {
  try {
    const res = await fetch(`https://api.alquran.cloud/v1/ayah/random/${translation}`);
    const j = await res.json();
    if (j?.data) return { ayah: j.data.text, surah: j.data.surah?.englishName || j.data.surah?.name, number: j.data.numberInSurah };
  } catch {}
  return null;
}

// ----------------- Islamic Quotes -----------------
const islamicQuotes = [
  '✨ اللّٰہ جسے چاہے عزت دے، جسے چاہے آزمائے۔',
  '🤍 صبر ایمان کا آدھا حصہ ہے۔',
  '💫 دعا مومن کا ہتھیار ہے۔',
  '💫 ہر دن ایک نیا موقع ہے اللہ کی رضا حاصل کرنے کا۔',
];

// ----------------- AI Reply -----------------
async function getAIReply(userMessage) {
  try {
    const API_KEY = "gifted";
    const BASE_URL = "https://api.giftedtech.web.id/api/ai/gpt4o";
    const response = await axios.get(BASE_URL, {
      params: { apikey: API_KEY, q: `براہ کرم اس کا جواب اردو میں مختصر اور پاکستانی انداز میں دیں: ${userMessage}` }
    });
    let reply = "⚠️ جواب حاصل نہیں ہو سکا۔";
    if (response.data?.result) {
      reply = response.data.result;
      const lines = reply.split(/[\n.؟]/).filter(Boolean);
      reply = lines.slice(0, 2).join('۔ ') + '۔';
    }
    return reply;
  } catch {
    return "⚠️ GPT API سے رابطہ نہیں ہو سکا۔";
  }
}

// ----------------- Greeting -----------------
function greetingMessage() {
  const h = moment().tz('Asia/Karachi').hour();
  const day = moment().tz('Asia/Karachi').day();
  if (day === 5 && h >= 11 && h < 16) return '🌸 جمعہ مبارک 🌸\nاللّٰہ ہمیں اپنے ذکر سے منور کرے 🤲';
  if (h >= 5 && h < 11) return '🌅 السلام علیکم! صبح بخیر ❤️\nاللہ آپ کا دن برکتوں سے بھر دے۔';
  if (h >= 11 && h < 15) return '☀️ دوپہر بخیر! اللہ آپ کو سکون عطا فرمائے۔';
  if (h >= 15 && h < 18) return '🌤️ عصر بخیر! اللہ آپ کے اعمال قبول فرمائے۔';
  if (h >= 18 && h < 22) return '🌇 مغرب بخیر! اللہ آپ کے دل کو سکون دے۔';
  return '🌙 شب بخیر 🌙\nاللہ آپ کو نیک خواب عطا فرمائے۔';
}

// ----------------- Command Handler -----------------
async function handleChatbotCommand(sock, chatId, msg, match, fullText = '') {
  const data = loadData();
  if (!chatId.endsWith('@g.us')) return sock.sendMessage(chatId, { text: '⚠️ یہ فیچر صرف گروپس کے لیے ہے۔' });

  const parts = fullText.trim().split(' ');
  const cmd = parts[0];
  const arg = parts.slice(1).join(' ');

  if (match === 'on') { 
    data.chatbot[chatId] = true; saveData(data); 
    return sock.sendMessage(chatId, { text: '✅ چیٹ بوٹ آن ہوگیا — اب میں اردو میں سب کو جواب دوں گا۔' }); 
  }
  if (match === 'off') { 
    delete data.chatbot[chatId]; saveData(data); 
    return sock.sendMessage(chatId, { text: '❌ چیٹ بوٹ بند کر دیا گیا۔' }); 
  }

  if (cmd === '.announce' && arg) { 
    data.announcements[chatId] = { text: arg, time: new Date().toISOString() }; saveData(data); 
    return sock.sendMessage(chatId, { text: `📢 اعلان:\n\n${arg}` }); 
  }

  return sock.sendMessage(chatId, { text: 'کمانڈز:\n.chatbot on / off\n.announce پیغام' });
}

// ----------------- Chatbot Response -----------------
async function handleChatbotResponse(sock, chatId, msg, userMessage, senderId) {
  const data = loadData();
  if (!data.chatbot[chatId]) return; // chatbot off → no reply
  if (!userMessage || typeof userMessage !== 'string') return; // ignore stickers/media

  await autoAzanNotifier(sock, chatId);

  // Greeting
  const greet = greetingMessage();
  if (greet) await sock.sendMessage(chatId, { text: greet });

  // Message counter for Azkar
  if (!chatMemory.userCounter.has(senderId)) chatMemory.userCounter.set(senderId, 0);
  let count = chatMemory.userCounter.get(senderId) + 1;
  chatMemory.userCounter.set(senderId, count);

  if (count % 50 === 0) await sendAzkar(sock, chatId, data);

  // Daily Ayah & Quote once per day
  if (!data.lastDailyMessage[chatId] || data.lastDailyMessage[chatId] !== todayDateString()) {
    const ay = await fetchRandomAyah();
    if (ay) await sock.sendMessage(chatId, { text: `📖 آج کی آیت:\n\n${ay.ayah}\n— سورہ ${ay.surah} (${ay.number})` });
    const quote = islamicQuotes[Math.floor(Math.random() * islamicQuotes.length)];
    await sock.sendMessage(chatId, { text: `💡 آج کا قول:\n${quote}` });
    data.lastDailyMessage[chatId] = todayDateString();
    saveData(data);
  }

  // Memory last 30 messages
  if (!chatMemory.messages.has(senderId)) chatMemory.messages.set(senderId, []);
  const arr = chatMemory.messages.get(senderId);
  arr.push(userMessage);
  if (arr.length > 30) arr.shift();

  // AI reply
  const aiReply = await getAIReply(userMessage);
  await sock.sendMessage(chatId, { text: aiReply });
}

// ----------------- Export -----------------
module.exports = { handleChatbotCommand, handleChatbotResponse };
