const axios = require('axios');
const fetch = require('node-fetch');

async function aiCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        
        if (!text) {
            return await sock.sendMessage(chatId, { 
                text: "Please provide a question after .gpt, .gemini, .gpt2 or .bill\n\nExample: .gpt write a basic html code"
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
                const API_KEY = "gifted";
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
                await sock.sendPresenceUpdate('composing', chatId);

                const response = await axios.get(`https://api.dreaded.site/api/chatgpt?text=${encodeURIComponent(query)}`);

                if (response.data && response.data.result && response.data.result.prompt) {
                    const prompt = response.data.result.prompt;
                    await sock.sendMessage(chatId, { text: prompt }, { quoted: message });
                } else {
                    throw new Error('Invalid response from GPT2 API');
                }

                await sock.sendPresenceUpdate('paused', chatId);

            // ================== BILL Command ==================
            } else if (command === '.bill') {
                await sock.sendPresenceUpdate('composing', chatId);

                try {
                    const payload = {
                        refNo: query,
                        secret_token: "token_4rpak_security",
                        app_name: "RoshanPakistan"
                    };

                    const response = await axios.post("https://bill.pitc.com.pk/bill/info", payload, {
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'Mozilla/5.0 (Linux; Android 12)',
                            'Accept': 'application/json',
                            'Referer': 'https://bill.pitc.com.pk/'
                        },
                        timeout: 10000
                    });

                    const data = response.data;

                    if (!data || !data.consumerName) {
                        return await sock.sendMessage(chatId, { 
                            text: "❌ No record found. Please check the reference number." 
                        }, { quoted: message });
                    }

                    const billMessage = `
📄 *⚡Electricity Bill Info⚡*

👤 *Consumer Name:* ${data.consumerName}
👨‍👦 *Father Name:* ${data.fatherName}
🏠 *Address:* ${data.address}
📑 *Reference No:* ${data.refNo}
📅 *Bill Month:* ${data.billMonth}
📆 *Meter Reading Date:* ${data.meterReadingDate}
🔌 *Units Consumed:* ${data.unitsConsumed}
💡 *Net Bill:* Rs. ${data.netBill}
⏰ *Due Date:* ${data.dueDate}
📈 *After Due Date:* Rs. ${data.afterDueDate}
🏢 *Division:* ${data.division}
🏙️ *Sub Division:* ${data.subDivision}
⚙️ *Feeder Name:* ${data.feederName}
📊 *Tariff:* ${data.tariff}

━━━━━━━━━━━━━━━━━━━━━━
👨‍💻 *SYSTEM DEVELOPER:* @923348544535  
💬 *WhatsApp:* https://wa.me/cyberexperpk
━━━━━━━━━━━━━━━━━━━━━━`;

                    await sock.sendMessage(chatId, { text: billMessage }, { quoted: message });
                    await sock.sendPresenceUpdate('paused', chatId);

                } catch (err) {
                    console.error('BILL API Error:', err.response?.data || err.message);
                    await sock.sendMessage(chatId, { 
                        text: "⚠️ Bill API request failed. Server may be down or reference number is invalid." 
                    }, { quoted: message });
                }
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
