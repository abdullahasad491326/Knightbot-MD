const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const USER_GROUP_DATA = path.join(__dirname, '../data/userGroupData.json');

// In-memory chat history & user info
const chatMemory = {
    messages: new Map(),
    userInfo: new Map()
};

// Load group data
function loadUserGroupData() {
    try {
        return JSON.parse(fs.readFileSync(USER_GROUP_DATA));
    } catch {
        return { groups: [], chatbot: {} };
    }
}

// Save group data
function saveUserGroupData(data) {
    fs.writeFileSync(USER_GROUP_DATA, JSON.stringify(data, null, 2));
}

// Random typing delay
function getRandomDelay() {
    return Math.floor(Math.random() * 3000) + 2000;
}

// Typing indicator
async function showTyping(sock, chatId) {
    try {
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);
        await new Promise(r => setTimeout(r, getRandomDelay()));
    } catch {}
}

// Extract user info
function extractUserInfo(message) {
    const info = {};
    if (message.toLowerCase().includes('my name is')) info.name = message.split('my name is')[1].trim().split(' ')[0];
    if (message.toLowerCase().includes('i am') && message.toLowerCase().includes('years old')) info.age = message.match(/\d+/)?.[0];
    if (message.toLowerCase().includes('i live in') || message.toLowerCase().includes('i am from')) info.location = message.split(/(?:i live in|i am from)/i)[1].trim().split(/[.,!?]/)[0];
    return info;
}

// Handle chatbot on/off commands
async function handleChatbotCommand(sock, chatId, message, match) {
    if (!chatId.endsWith('@g.us')) {
        return sock.sendMessage(chatId, { text: '❌ Chatbot works only in groups.', quoted: message });
    }

    const data = loadUserGroupData();
    const senderId = message.key.participant || message.key.remoteJid;
    const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const isOwner = senderId === botNumber;

    // Only admin or owner
    let isAdmin = false;
    if (!isOwner) {
        try {
            const group = await sock.groupMetadata(chatId);
            isAdmin = group.participants.some(p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin'));
        } catch {}
    }
    if (!isOwner && !isAdmin) return sock.sendMessage(chatId, { text: '❌ Only group admins or bot owner can use this command.', quoted: message });

    if (match === 'on') {
        data.chatbot[chatId] = true;
        saveUserGroupData(data);
        return sock.sendMessage(chatId, { text: '*✅ Chatbot enabled! I will now reply to every message in this group.*', quoted: message });
    }
    if (match === 'off') {
        delete data.chatbot[chatId];
        saveUserGroupData(data);
        return sock.sendMessage(chatId, { text: '*❌ Chatbot disabled!*', quoted: message });
    }

    return sock.sendMessage(chatId, { text: '*Use:*\n.chatbot on → Enable\n.chatbot off → Disable', quoted: message });
}

// Auto-reply to every group message if chatbot is on
async function handleChatbotResponse(sock, chatId, message, userMessage, senderId) {
    if (!chatId.endsWith('@g.us')) return;

    const data = loadUserGroupData();
    if (!data.chatbot[chatId]) return;

    try {
        if (!chatMemory.messages.has(senderId)) {
            chatMemory.messages.set(senderId, []);
            chatMemory.userInfo.set(senderId, {});
        }

        const userInfo = extractUserInfo(userMessage);
        if (Object.keys(userInfo).length > 0) chatMemory.userInfo.set(senderId, { ...chatMemory.userInfo.get(senderId), ...userInfo });

        const messages = chatMemory.messages.get(senderId);
        messages.push(userMessage);
        if (messages.length > 20) messages.shift();
        chatMemory.messages.set(senderId, messages);

        await showTyping(sock, chatId);

        const response = await getAIResponse(userMessage, { messages, userInfo: chatMemory.userInfo.get(senderId) });
        if (!response) return;

        await new Promise(r => setTimeout(r, getRandomDelay()));
        await sock.sendMessage(chatId, { text: response }, { quoted: message });

    } catch (e) {
        console.error('Chatbot response error:', e.message);
    }
}

// Fetch AI response from API
async function getAIResponse(userMessage, userContext = {}) {
    try {
        const prompt = `
Chat naturally on WhatsApp like a human. Respond short & casual.
User message: ${userMessage}
Context: ${JSON.stringify(userContext)}
        `.trim();

        const res = await fetch(`https://api.dreaded.site/api/chatgpt?text=${encodeURIComponent(prompt)}`);
        const data = await res.json();
        if (!data.success) return null;

        return data.result.prompt;
    } catch {
        return null;
    }
}

module.exports = {
    handleChatbotCommand,
    handleChatbotResponse
};
