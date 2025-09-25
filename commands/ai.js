const axios = require('axios');
const fetch = require('node-fetch');

async function aiCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        
        if (!text) {
            return await sock.sendMessage(chatId, { 
                text: "Please provide a question after .gpt, .gemini, or .gpt2\n\nExample: .gpt write a basic html code"
            }, { quoted: message });
        }

        // Get the command and query
        const parts = text.split(' ');
        const command = parts[0].toLowerCase();
        const query = parts.slice(1).join(' ').trim();

        if (!query) {
            return await sock.sendMessage(chatId, { 
                text: `Please provide a question after ${command}`
            }, { quoted: message });
        }

        try {
            // Show processing emoji
            await sock.sendMessage(chatId, {
                react: { text: '🤖', key: message.key }
            });

            // ================== GPT Command ==================
            if (command === '.gpt') {
                const API_KEY = "gifted"; // replace with your key if needed
                const BASE_URL = "https://api.giftedtech.web.id/api/ai/gpt4o";

                const response = await axios.get(BASE_URL, {
                    params: { apikey: API_KEY, q: query }
                });

                if (response.data && response.data.result) {
                    const answer = response.data.result;
                    await sock.sendMessage(chatId, { text: answer }, { quoted: message });
                } else {
                    throw new Error('Invalid response from GPT API');
                }

            // ================== Gemini Command ==================
            } else if (command === '.gemini') {
                const apis = [
                    `https://vapis.my.id/api/gemini?q=${encodeURIComponent(query)}`,
                    `https://api.siputzx.my.id/api/ai/gemini-pro?content=${encodeURIComponent(query)}`,
                    `https://api.ryzendesu.vip/api/ai/gemini?text=${encodeURIComponent(query)}`,
                    `https://api.dreaded.site/api/gemini2?text=${encodeURIComponent(query)}`,
                    `https://api.giftedtech.my.id/api/ai/geminiai?apikey=gifted&q=${encodeURIComponent(query)}`,
                    `https://api.giftedtech.my.id/api/ai/geminiaipro?apikey=gifted&q=${encodeURIComponent(query)}`
                ];

                for (const api of apis) {
                    try {
                        const response = await fetch(api);
                        const data = await response.json();

                        if (data.message || data.data || data.answer || data.result) {
                            const answer = data.message || data.data || data.answer || data.result;
                            await sock.sendMessage(chatId, { text: answer }, { quoted: message });
                            return;
                        }
                    } catch (e) { continue; }
                }
                throw new Error('All Gemini APIs failed');

            // ================== GPT2 Command ==================
            } else if (command === '.gpt2') {
                // Show typing indicator
                await sock.sendPresenceUpdate('composing', chatId);

                const response = await axios.get(`https://api.dreaded.site/api/chatgpt?text=${encodeURIComponent(query)}`);

                if (response.data && response.data.result && response.data.result.prompt) {
                    const prompt = response.data.result.prompt;
                    await sock.sendMessage(chatId, { text: prompt }, { quoted: message });
                } else {
                    throw new Error('Invalid response from GPT2 API');
                }

                // Stop typing
                await sock.sendPresenceUpdate('paused', chatId);
            }

        } catch (error) {
            console.error('API Error:', error);
            await sock.sendMessage(chatId, {
                text: "❌ Failed to get response. Please try again later.",
                contextInfo: { mentionedJid: [message.key.participant || message.key.remoteJid] }
            }, { quoted: message });
        }

    } catch (error) {
        console.error('AI Command Error:', error);
        await sock.sendMessage(chatId, {
            text: "❌ An error occurred. Please try again later.",
            contextInfo: { mentionedJid: [message.key.participant || message.key.remoteJid] }
        }, { quoted: message });
    }
}

module.exports = aiCommand;
