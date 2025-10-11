const fs = require('fs');
const path = require('path');
const axios = require('axios');
const azan = require('adhan');
const moment = require('moment-timezone');

// ================== CONFIG ==================
const USER_GROUP_DATA = path.join(__dirname, '../data/userGroupData.json');
const BOT_TRIGGER = "@Bot"; // Must start with this
const BOT_JID = '923261649609@s.whatsapp.net'; // Bot number

// ================== MEMORY ==================
const chatMemory = {
  userCounter: new Map(),
  messages: new Map(),
};

// ================== UTILITIES ==================
function loadData() {
  try {
    return JSON.parse(fs.readFileSync(USER_GROUP_DATA));
  } catch {
    return {
      chatbot: {}, prayerNotified: {}, dailyAyah: {},
      dailyAyahDate: {}, announcements: {},
      lastAzkarDate: {}, lastDailyMessage: {},
      lastReminderTime: {}
    };
  }
}

function saveData(data) {
  try { fs.writeFileSync(USER_GROUP_DATA, JSON.stringify(data, null, 2)); }
  catch (e) { console.error('[DATA SAVE ERROR]', e); }
}

function todayDateString() {
  return moment().tz('Asia/Karachi').format('YYYY-MM-DD');
}

// ================== PRAYER TIMES ==================
function getPrayerTimes(coords = { lat: 33.6844, lon: 73.0479 }) {
  const date = new Date();
  const coordinates = new azan.Coordinates(coords.lat, coords.lon);
  const params = azan.CalculationMethod.MuslimWorldLeague();
  const times = new azan.PrayerTimes(coordinates, date, params);
  const fmt = d => moment(d).tz('Asia/Karachi').format('hh:mm A');
  return {
    fajr: fmt(times.fajr),
    dhuhr: fmt(times.dhuhr),
    asr: fmt(times.asr),
    maghrib: fmt(times.maghrib),
    isha: fmt(times.isha),
  };
}

// ================== AUTO AZAN ==================
async function autoAzanNotifier(sock, chatId) {
  const data = loadData();
  if (!data.prayerNotified[chatId]) data.prayerNotified[chatId] = {};

  const currentTime = moment().tz('Asia/Karachi').format('HH:mm');
  const prayers = getPrayerTimes();

  for (let [key, val] of Object.entries(prayers)) {
    const pTime = moment(val, 'hh:mm A').format('HH:mm');
    if (pTime === currentTime && data.prayerNotified[chatId][key] !== todayDateString()) {
      data.prayerNotified[chatId][key] = todayDateString();
      saveData(data);
      const names = { fajr: 'فجر', dhuhr: 'ظہر', asr: 'عصر', maghrib: 'مغرب', isha: 'عشاء' };
      await sock.sendMessage(chatId, { text: `🕌 ${names[key]} کی اذان کا وقت ہوگیا ہے!\n(وقت: ${val})` });
    }
  }
}

// ================== ISLAMIC CONTENT ==================
const dailyDuas = [
  '🤲 اللّٰهُمَّ اِنِّی اَسْأَلُکَ الْعَفْوَ وَالْعَافِیَةَ۔',
  '🕊️ اَسْتَغْفِرُاللّٰهَ رَبِّی مِنْ كُلِّ ذَنْبٍ۔',
  '💫 اللّٰہُمَّ اِنِّیْ اَسْأَلُکَ رِضَاکَ وَالْجَنَّةَ۔',
  '🌸 اللہ ہمیں صبر اور حکمت عطا فرمائے۔',
  '🕌 اللہ ہماری نماز اور عبادات قبول فرمائے۔'
];

const islamicQuotes = [
  '✨ اللّٰہ جسے چاہے عزت دے، جسے چاہے آزمائے۔',
  '🤍 صبر ایمان کا آدھا حصہ ہے۔',
  '💫 دعا مومن کا ہتھیار ہے۔',
  '💡 اللہ کی رحمت ہر چیز پر غالب ہے۔',
  '🕊️ نیکی اور صدقہ دل کو سکون دیتا ہے۔'
];

// ================== GPT REPLY ==================
async function getAIReply(userMessage) {
  try {
    const res = await axios.get("https://api.giftedtech.web.id/api/ai/gpt4o", {
      params: { apikey: "gifted", q: ` اردو میں مکمل مگر مختصر سا جواب دیں زیادہ لمبا نہیں: ${userMessage}` },
      timeout: 10000
    });
    return res.data?.result?.trim() || "⚠️ جواب حاصل نہیں ہو سکا۔";
  } catch (e) {
    console.error('[GPT ERROR]', e.message);
    return "⚠️ GPT سروس سے فی الحال جواب حاصل نہیں ہو سکا۔";
  }
}

// ================== FAQ ==================
function getIslamicFAQ(text) {
  const faqs = [
    { q: /روزہ|رمضان/, a: '🌙 روزہ فجر سے مغرب تک رکھا جاتا ہے۔ نیت دل میں کافی ہے، افطار کے وقت دعا پڑھنا سنت ہے۔' },
    { q: /زکوۃ|زکات/, a: '💰 زکوٰۃ 2.5٪ مال پر فرض ہے جو نصاب سے زیادہ ہو اور ایک سال گزر جائے۔' },
    { q: /نماز|اذان/, a: '🕌 نماز دن میں 5 وقت فرض ہے: فجر، ظہر، عصر، مغرب، عشاء۔' },
    { q: /صدقہ/, a: '🕊️ صدقہ دل کو سکون دیتا ہے، چاہے ایک مسکراہٹ ہی کیوں نہ ہو۔' },
    { q: /دعا/, a: '🤲 دعا مومن کا ہتھیار ہے، اللہ سے مانگنا ایمان کی علامت ہے۔' }
  ];
  for (const f of faqs) if (f.q.test(text)) return f.a;
  return null;
}

// ================== COMMANDS ==================
async function handleChatbotCommand(sock, chatId, msg, match, fullText = '') {
  const data = loadData();
  const parts = fullText.trim().split(' ');
  const cmd = parts[0];
  const arg = parts.slice(1).join(' ');

  if (match === 'on') {
    data.chatbot[chatId] = true; saveData(data);
    return sock.sendMessage(chatId, { text: '✅ چیٹ بوٹ آن ہوگیا — اب میں صرف "@Bot" سے شروع ہونے والے میسج پر جواب دوں گا۔' });
  }

  if (match === 'off') {
    delete data.chatbot[chatId]; saveData(data);
    return sock.sendMessage(chatId, { text: '❌ چیٹ بوٹ بند کر دیا گیا۔' });
  }

  if (cmd === '.namaz') {
    const t = getPrayerTimes();
    return sock.sendMessage(chatId, { text: `🕰️ آج کے نماز کے اوقات:\nفجر: ${t.fajr}\nظہر: ${t.dhuhr}\nعصر: ${t.asr}\nمغرب: ${t.maghrib}\nعشاء: ${t.isha}` });
  }

  if (cmd === '.myrecord') {
    const count = chatMemory.userCounter.get(msg.key.participant) || 0;
    return sock.sendMessage(chatId, { text: `📊 آپ کو اب تک ${count} اسلامی پیغامات موصول ہو چکے ہیں۔` });
  }

  if (cmd === '.announce' && arg) {
    data.announcements[chatId] = { text: arg, time: new Date().toISOString() };
    saveData(data);
    return sock.sendMessage(chatId, { text: `📢 اعلان:\n${arg}` });
  }

  return sock.sendMessage(chatId, { text: '📜 دستیاب کمانڈز:\n.chatbot on/off\n.namaz\n.myrecord\n.announce پیغام' });
}

// ================== CHATBOT RESPONSE ==================
async function handleChatbotResponse(sock, chatId, msg, userMessage, senderId) {
  const data = loadData();
  if (!data.chatbot[chatId]) return;
  if (!userMessage) return;

  // Ignore media/stickers etc.
  if (msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.stickerMessage ||
      msg.message?.audioMessage || msg.message?.documentMessage) return;

  // ✅ Reply only if message starts with "@BOT"
  if (!userMessage.trim().toUpperCase().startsWith(BOT_TRIGGER)) return;

  const cleanText = userMessage.replace(BOT_TRIGGER, '').trim();
  if (!cleanText) return;

  await autoAzanNotifier(sock, chatId);

  chatMemory.userCounter.set(senderId, (chatMemory.userCounter.get(senderId) || 0) + 1);

  // ✳️ Check FAQ first
  const faq = getIslamicFAQ(cleanText);
  if (faq) return sock.sendMessage(chatId, { text: faq });

  // 🌙 Daily Dua & Quote once a day
  if (data.lastDailyMessage[chatId] !== todayDateString()) {
    const dua = dailyDuas[Math.floor(Math.random() * dailyDuas.length)];
    const quote = islamicQuotes[Math.floor(Math.random() * islamicQuotes.length)];
    await sock.sendMessage(chatId, { text: `🤲 آج کی دعا:\n${dua}\n\n💡 قول:\n${quote}` });
    data.lastDailyMessage[chatId] = todayDateString();
    saveData(data);
  }

  // 💬 AI reply
  const aiReply = await getAIReply(cleanText);
  await sock.sendMessage(chatId, { text: aiReply });
}

// ================== AUTO TASKS ==================
async function sendJummaMessage(sock) {
  const data = loadData();
  const now = moment().tz('Asia/Karachi');
  if (now.day() !== 5 || now.format('HH:mm') !== '09:00') return;

  for (const chatId of Object.keys(data.chatbot)) {
    await sock.sendMessage(chatId, {
      text: `🌙 *جمعہ مبارک!* 🌙\n\n📖 "${islamicQuotes[Math.floor(Math.random() * islamicQuotes.length)]}"\n\n🤲 ${dailyDuas[Math.floor(Math.random() * dailyDuas.length)]}`
    });
  }
}

async function randomReminder(sock) {
  const data = loadData();
  const now = moment().tz('Asia/Karachi');
  const last = data.lastReminderTime ? moment(data.lastReminderTime) : null;
  if (last && now.diff(last, 'hours') < 4) return;
  data.lastReminderTime = now.toISOString();
  saveData(data);

  for (const chatId of Object.keys(data.chatbot)) {
    await sock.sendMessage(chatId, { text: `📿 ${islamicQuotes[Math.floor(Math.random() * islamicQuotes.length)]}` });
  }
}

// ================== EXPORT ==================
module.exports = {
  handleChatbotCommand,
  handleChatbotResponse,
  sendJummaMessage,
  randomReminder
};
