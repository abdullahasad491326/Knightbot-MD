// knight-urdu-bot.js
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const azan = require('adhan');

const USER_GROUP_DATA = path.join(__dirname, '../data/userGroupData.json');
const chatMemory = { messages: new Map(), userInfo: new Map(), counter: {} };

// ----------------- Data load/save -----------------
function loadData() {
    try { return JSON.parse(fs.readFileSync(USER_GROUP_DATA)); }
    catch { return {
        chatbot: {},            // groupId -> true/false
        prayerNotified: {},     // groupId -> { fajr: dateSent, ... }
        dailyAyah: {},          // groupId -> true/false
        dailyAyahDate: {},      // groupId -> yyyy-mm-dd when sent
        announcements: {}       // groupId -> last announcement text
    }; }
}
function saveData(d) { fs.writeFileSync(USER_GROUP_DATA, JSON.stringify(d, null, 2)); }

// ----------------- Helpers -----------------
function randomDelay() { return Math.floor(Math.random() * 3000) + 1000; }
async function typing(sock, id) {
    try {
        await sock.presenceSubscribe(id);
        await sock.sendPresenceUpdate('composing', id);
        await new Promise(r => setTimeout(r, randomDelay()));
    } catch (e) { /* ignore */ }
}
function todayDateString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ----------------- Prayer times (Adhan) -----------------
function getPrayerTimes(coords = { lat:31.582045, lon:74.329376 }) {
    const date = new Date();
    const coordinates = new azan.Coordinates(coords.lat, coords.lon);
    const params = azan.CalculationMethod.MuslimWorldLeague();
    const times = new azan.PrayerTimes(coordinates, date, params);
    const fmt = dt => dt.toLocaleTimeString('ur-PK', { hour: '2-digit', minute: '2-digit' });
    return {
        fajr: fmt(times.fajr),
        dhuhr: fmt(times.dhuhr),
        asr: fmt(times.asr),
        maghrib: fmt(times.maghrib),
        isha: fmt(times.isha)
    };
}

// ----------------- Auto Azan Notifier -----------------
// Sends notification exactly once when current time matches prayer time (minute-precision)
async function autoAzanNotifier(sock, chatId, coords) {
    const data = loadData();
    if (!data.prayerNotified) data.prayerNotified = {};
    if (!data.prayerNotified[chatId]) data.prayerNotified[chatId] = {};

    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const curStr = `${h}:${m}`;

    const prayers = getPrayerTimes(coords);
    for (let [key, val] of Object.entries(prayers)) {
        // val example "05:12 AM" in ur-PK locale — normalize to 24h "H:MM"
        // We'll parse by creating a Date from today's date + val
        try {
            const parsed = new Date(`${now.toDateString()} ${val}`);
            const ph = parsed.getHours();
            const pm = parsed.getMinutes();
            const pStr = `${ph}:${pm}`;
            if (pStr === curStr && data.prayerNotified[chatId][key] !== todayDateString()) {
                data.prayerNotified[chatId][key] = todayDateString();
                saveData(data);
                const prayerNames = { fajr: "فجر", dhuhr: "ظہر", asr: "عصر", maghrib: "مغرب", isha: "عشاء" };
                await sock.sendMessage(chatId, { text: `🕌 ${prayerNames[key]} کی اذان کا وقت ہوگیا ہے!\nاللہ اکبر، اللہ اکبر 🤲\n(وقت: ${val})` });
            }
        } catch(e) {
            // parsing may fail for locale variation — ignore
        }
    }
}

// ----------------- Greetings, Duas, Quotes -----------------
function greetingMessage() {
    const h = new Date().getHours();
    if (h >= 5 && h < 11) return "🌅 السلام علیکم! صبح بخیر ❤️\nاللہ آپ کا دن برکتوں سے بھر دے۔";
    if (h >= 22 || h < 5) return "🌙 شب بخیر 🌙\nاللہ آپ کو سکون اور نیک خواب عطا فرمائے۔";
    if (new Date().getDay() === 5) return "🌸 جمعہ مبارک 🌸\nاللّٰہ ہمیں اپنے ذکر سے منور کرے 🤲";
    return null;
}
const dailyDuas = [
    "🤲 اللّٰهُمَّ اِنِّی اَسْأَلُکَ الْعَفْوَ وَالْعَافِیَةَ۔",
    "🕊️ اَسْتَغْفِرُاللّٰهَ رَبِّی مِنْ كُلِّ ذَنْبٍ۔",
    "💫 اللّٰہُمَّ اِنِّیْ اَسْأَلُکَ رِضَاکَ وَالْجَنَّةَ۔",
    "🌙 رَبِّ زِدْنِی عِلْمًا۔",
    "💖 سُبْحَانَ اللّٰهِ وَبِحَمْدِهِ، سُبْحَانَ اللّٰهِ الْعَظِیْمِ۔"
];
const islamicQuotes = [
    "✨ اللّٰہ جسے چاہے عزت دے، جسے چاہے آزمائے۔",
    "🤍 صبر ایمان کا آدھا حصہ ہے۔",
    "💫 دعا مومن کا ہتھیار ہے۔",
    "🌙 نیکی چھوٹی نہیں ہوتی، نیت بڑی ہوتی ہے۔",
    "🕊️ جو اللّٰہ پر بھروسہ کرے، اللّٰہ اس کے لیے کافی ہے۔"
];

// ----------------- Daily Ayah (Quran) -----------------
// Uses Al-Quran Cloud API (random ayah) with translation fallback.
// Endpoint examples (used at runtime): https://api.alquran.cloud/v1/ayah/random/en.asad
// For Urdu translation you can try ur.junagarhi or ur.ahmedali depending on availability.
async function fetchRandomAyah(translation = 'ur.junagarhi') {
    try {
        const resp = await fetch(`https://api.alquran.cloud/v1/ayah/random/${translation}`);
        const data = await resp.json();
        if (data && data.data) {
            const ayah = data.data.text || data.data.ayah || '';
            const surah = data.data.surah?.englishName || data.data.surah?.name || '';
            const number = data.data.numberInSurah || data.data.number || '';
            const tr = data.data.translation || data.data.translations || data.data.text; // best-effort
            return { ayah, surah, number, tr, raw: data.data };
        }
    } catch(e) { /* ignore */ }
    // fallback: try generic random ayah (no translation)
    try {
        const resp2 = await fetch(`https://api.alquran.cloud/v1/ayah/random`);
        const d2 = await resp2.json();
        if (d2 && d2.data) return { ayah: d2.data.text, surah: d2.data.surah?.englishName || '', number: d2.data.numberInSurah || '', tr: null, raw: d2.data };
    } catch(e) {}
    return null;
}

// ----------------- Hijri Date (AlAdhan API) -----------------
// Uses: http://api.aladhan.com/v1/gToH?date=DD-MM-YYYY
async function fetchHijriDate() {
    try {
        const d = new Date();
        const dd = String(d.getDate()).padStart(2,'0');
        const mm = String(d.getMonth()+1).padStart(2,'0');
        const yyyy = d.getFullYear();
        const url = `http://api.aladhan.com/v1/gToH?date=${dd}-${mm}-${yyyy}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && data.data) {
            return data.data.hijri || data.data;
        }
    } catch (e) {}
    return null;
}

// ----------------- Voice reply (optional) -----------------
// This function expects an external TTS endpoint that returns audio url or buffer.
// For demo we call a fictional endpoint on api.dreaded.site (you can replace with real TTS).
async function getTTSUrl(text) {
    try {
        // Replace with your working Urdu TTS provider if available.
        const api = `https://api.dreaded.site/api/voice?text=${encodeURIComponent(text)}&lang=ur`;
        // The bot will send this URL as audio message (PTT).
        return api;
    } catch { return null; }
}
async function sendVoiceReply(sock, chatId, text) {
    const url = await getTTSUrl(text);
    if (!url) return;
    try {
        await sock.sendMessage(chatId, {
            audio: { url },
            mimetype: 'audio/mpeg',
            ptt: true
        });
    } catch(e) { /* ignore */ }
}

// ----------------- Admin-only commands & announcement system -----------------
async function isAdminOfGroup(sock, chatId, userId) {
    try {
        const meta = await sock.groupMetadata(chatId);
        return meta.participants.some(p => p.id === userId && (p.admin === 'admin' || p.admin === 'superadmin'));
    } catch(e) {
        return false;
    }
}

// handle commands (.chatbot on/off, .announce <text>, .dailyayah on/off, .hijri, .announceSchedule optional)
async function handleChatbotCommand(sock, chatId, msg, match, fullText = '') {
    const data = loadData();
    const senderId = msg.key.participant || msg.key.remoteJid;

    // Only allow in groups
    if (!chatId.endsWith('@g.us')) {
        return sock.sendMessage(chatId, { text: "⚠️ یہ فیچر صرف گروپس کے لیے ہے۔" });
    }

    // admin check
    const admin = await isAdminOfGroup(sock, chatId, senderId);
    if (!admin) {
        return sock.sendMessage(chatId, { text: "⚠️ صرف گروپ ایڈمن اس کمانڈ کو چلا سکتا ہے۔" });
    }

    const parts = fullText.trim().split(' ').filter(Boolean);
    const cmd = parts[0] || '';
    const arg = parts.slice(1).join(' ').trim();

    // Primary toggles
    if (match === 'on') {
        data.chatbot[chatId] = true;
        saveData(data);
        return sock.sendMessage(chatId, { text: "✅ چیٹ بوٹ آن کیا گیا — اب میں گروپ کے ہر پیغام کا اردو میں جواب دوں گا۔" });
    }
    if (match === 'off') {
        delete data.chatbot[chatId];
        saveData(data);
        return sock.sendMessage(chatId, { text: "❌ چیٹ بوٹ بند کر دیا گیا۔" });
    }

    // Sub-commands (announce / dailyayah / hijri)
    if (cmd === '.announce') {
        if (!arg) return sock.sendMessage(chatId, { text: "استعمال: .announce آپ کے پیغام یہاں" });
        // Save last announcement and send
        if (!data.announcements) data.announcements = {};
        data.announcements[chatId] = { text: arg, time: new Date().toISOString(), by: senderId };
        saveData(data);
        await sock.sendMessage(chatId, { text: `📢 اعلان:\n\n${arg}\n\n(اعلان بھیج دیا گیا)` });
        return;
    }

    if (cmd === '.dailyayah') {
        if (arg === 'on') {
            if (!data.dailyAyah) data.dailyAyah = {};
            data.dailyAyah[chatId] = true;
            saveData(data);
            return sock.sendMessage(chatId, { text: "🕋 روزانہ کی آیت آن کر دی گئی۔ ہر دن ایک آیت گروپ میں بھیجی جائے گی۔" });
        }
        if (arg === 'off') {
            if (data.dailyAyah) delete data.dailyAyah[chatId];
            saveData(data);
            return sock.sendMessage(chatId, { text: "🕋 روزانہ آیت بند کر دی گئی۔" });
        }
        return sock.sendMessage(chatId, { text: "استعمال: .dailyayah on / .dailyayah off" });
    }

    if (cmd === '.hijri') {
        const h = await fetchHijriDate();
        if (!h) return sock.sendMessage(chatId, { text: "⚠️ ہجری تاریخ حاصل کرنے میں دشواری ہوئی۔" });
        const txt = `📅 آج کی ہجری تاریخ:\n${h.date || (h.day + ' ' + h.month?.ar + ' ' + h.year)}`;
        return sock.sendMessage(chatId, { text: txt });
    }

    // help default
    return sock.sendMessage(chatId, {
        text: `کمانڈز (صرف ایڈمن):\n.chatbot on / .chatbot off\n.announce <پیغام>  → فوراً اعلان بھیجیں\n.dailyayah on|off  → روزانہ آیت آن/آف\n.hijri  → آج کی ہجری تاریخ دکھائیں`
    });
}

// ----------------- Main group response handler -----------------
async function handleChatbotResponse(sock, chatId, msg, userMessage, senderId) {
    const data = loadData();
    if (!data.chatbot || !data.chatbot[chatId]) return;

    // 1) Auto Azan notifier (checks minute-precision)
    await autoAzanNotifier(sock, chatId);

    // 2) Daily Ayah: if enabled and not sent today, send once per day
    try {
        if (data.dailyAyah && data.dailyAyah[chatId]) {
            const last = data.dailyAyahDate && data.dailyAyahDate[chatId];
            const today = todayDateString();
            if (last !== today) {
                const ay = await fetchRandomAyah('ur.junagarhi'); // try ur translation
                if (ay) {
                    const text = `📖 آج کی آیت:\n\n${ay.ayah}\n\n— سورہ ${ay.surah} (${ay.number})\n\nترجمہ:\n${ay.tr || ''}`;
                    await sock.sendMessage(chatId, { text });
                } else {
                    await sock.sendMessage(chatId, { text: "📖 آج کی آیت حاصل نہیں ہو سکی، بعد میں کوشش کریں۔" });
                }
                data.dailyAyahDate = data.dailyAyahDate || {};
                data.dailyAyahDate[chatId] = today;
                saveData(data);
            }
        }
    } catch(e) { /* ignore errors */ }

    // 3) Occasional greetings / duas / quotes
    const greet = greetingMessage();
    if (greet && Math.random() < 0.12) await sock.sendMessage(chatId, { text: greet });

    if (Math.random() < 0.08) await sock.sendMessage(chatId, { text: dailyDuas[Math.floor(Math.random()*dailyDuas.length)] });
    if (Math.random() < 0.06) await sock.sendMessage(chatId, { text: islamicQuotes[Math.floor(Math.random()*islamicQuotes.length)] });

    // 4) Memory system
    if (!chatMemory.messages.has(senderId)) chatMemory.messages.set(senderId, []);
    const messages = chatMemory.messages.get(senderId);
    messages.push(userMessage);
    if (messages.length > 50) messages.shift();

    // store simple name from pushName if available
    if (!chatMemory.userInfo.get(senderId)) {
        chatMemory.userInfo.set(senderId, { name: msg.pushName || 'دوست' });
    }

    // 5) Counters & gratitude reminder
    if (!chatMemory.counter[chatId]) chatMemory.counter[chatId] = 0;
    chatMemory.counter[chatId]++;
    if (chatMemory.counter[chatId] % 50 === 0) await sock.sendMessage(chatId, { text: "الحمدللّٰہ ❤️ ہمیشہ شکر ادا کریں۔" });

    // 6) Generate AI reply (Urdu) and send (quoted)
    await typing(sock, chatId);
    const userInfo = chatMemory.userInfo.get(senderId) || {};
    const reply = await getAIResponse(userMessage, userInfo);
    if (!reply) return;

    await sock.sendMessage(chatId, { text: reply }, { quoted: msg });

    // 7) Occasionally send voice reply (20%): uses TTS provider configured earlier
    if (Math.random() < 0.20) {
        try { await sendVoiceReply(sock, chatId, reply); } catch(e) {}
    }
}

// ----------------- Exports -----------------
module.exports = {
    handleChatbotCommand,
    handleChatbotResponse
};
