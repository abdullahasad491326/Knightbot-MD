const axios = require('axios');
const fetch = require('node-fetch');

async function aiCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        if (!text) {
            return await sock.sendMessage(chatId, { 
                text: "Please provide a question after .gpt, .gemini, .gpt2 or .bill\n\n📌 Example:\n.gpt write a basic html code\n.bill 13154361400300"
            }, { quoted: message });
        }

        const parts = text.split(' ');
        const command = parts[0].toLowerCase();
        const query = parts.slice(1).join(' ').trim();

        if (!query) {
            return await sock.sendMessage(chatId, { 
                text: `❌ Please provide a valid query after ${command}`
            }, { quoted: message });
        }

        // show reaction
        await sock.sendMessage(chatId, { react: { text: '⚙️', key: message.key } });

        // ================= GPT =================
        if (command === '.gpt') {
            const API_KEY = "gifted";
            const BASE_URL = "https://api.giftedtech.web.id/api/ai/gpt4o";
            const response = await axios.get(BASE_URL, { params: { apikey: API_KEY, q: query } });
            if (response.data?.result) {
                await sock.sendMessage(chatId, { text: response.data.result }, { quoted: message });
            } else throw new Error("Invalid GPT response");

        // ================= GEMINI =================
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
                        return await sock.sendMessage(chatId, { text: answer }, { quoted: message });
                    }
                } catch (e) { continue; }
            }
            throw new Error('All Gemini APIs failed');

        // ================= GPT2 =================
        } else if (command === '.gpt2') {
            await sock.sendPresenceUpdate('composing', chatId);
            const response = await axios.get(`https://api.dreaded.site/api/chatgpt?text=${encodeURIComponent(query)}`);
            if (response.data?.result?.prompt) {
                await sock.sendMessage(chatId, { text: response.data.result.prompt }, { quoted: message });
            } else throw new Error("Invalid GPT2 response");
            await sock.sendPresenceUpdate('paused', chatId);

        // ================== BILL Command ==================
        } else if (command === '.bill') {
            await sock.sendPresenceUpdate('composing', chatId);

            const payload = {
                refNo: query,
                secret_token: "token_4rpak_security",
                app_name: "RoshanPakistan"
            };

            const response = await axios.post(
                "https://bill.pitc.com.pk/bill/info",
                payload,
                {
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json; utf-8",
                        "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 11; Pixel 4 Build/RD2A.211001.002)",
                        "Connection": "Keep-Alive",
                        "Accept-Encoding": "gzip",
                        "Host": "bill.pitc.com.pk"
                    },
                    timeout: 15000
                }
            );

            const bill = response.data?.basicInfo;

            if (!bill || !bill.consumerName) {
                return await sock.sendMessage(chatId, { 
                    text: "❌ No bill data found. Please check the reference number." 
                }, { quoted: message });
            }

            // ✨ Stylish WhatsApp Bill Response ✨
            const billMessage = `
⚡ *Electricity Bill Information*
━━━━━━━━━━━━━━━━━━━━━━━
👤 *Consumer Name:* ${bill.consumerName?.trim() || "N/A"}
👨‍👦 *Father Name:* ${bill.consumerFName?.trim() || "N/A"}
🏠 *Address:* ${(bill.consumerAddress1 || "").trim()} ${(bill.consumerAddress2 || "").trim()}
📑 *Reference No:* ${bill.refNo || "N/A"}
📆 *Bill Month:* ${bill.billMonth?.split("T")[0] || "N/A"}
🔌 *Units Used:* ${bill.totCurCons || "N/A"}
💡 *Current Bill:* Rs. ${bill.netBill || "N/A"}
⏰ *Due Date:* ${bill.billDueDate?.split("T")[0] || "N/A"}
💰 *After Due Date:* Rs. ${bill.currAmntDue || "N/A"}

━━━━━━━━━━━━━━━━━━━━━━━
👨‍💻 *SYSTEM DEVELOPER:* https://wa.me/cyberexperpk
━━━━━━━━━━━━━━━━━━━━━━━`;

            await sock.sendMessage(chatId, { text: billMessage }, { quoted: message });
            await sock.sendPresenceUpdate('paused', chatId);
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
