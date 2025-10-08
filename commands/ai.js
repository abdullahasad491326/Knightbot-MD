const axios = require('axios');
const fetch = require('node-fetch');

async function aiCommand(sock, chatId, message) {
    try {
        const text =
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            message.message?.imageMessage?.caption ||
            message.message?.videoMessage?.caption ||
            "";

        if (!text) {
            return await sock.sendMessage(chatId, { 
                text: "Please provide a question after .gpt, .gemini, .gpt2 or .bill\n\nExample: .bill 13154361400302"
            }, { quoted: message });
        }

        const parts = text.split(' ');
        const command = parts[0].toLowerCase();
        const query = parts.slice(1).join(' ').trim();

        if (!query) {
            return await sock.sendMessage(chatId, { 
                text: `Please provide a reference number after ${command}\nExample: .bill 13154361400302`
            }, { quoted: message });
        }

        // 🤖 React to show processing
        await sock.sendMessage(chatId, {
            react: { text: '⚡', key: message.key }
        });

        // ================== GPT COMMAND ==================
        if (command === '.gpt') {
            const API_KEY = "gifted";
            const BASE_URL = "https://api.giftedtech.web.id/api/ai/gpt4o";

            const response = await axios.get(BASE_URL, {
                params: { apikey: API_KEY, q: query }
            });

            const answer = response.data?.result || "❌ No response from GPT.";
            return await sock.sendMessage(chatId, { text: answer }, { quoted: message });
        }

        // ================== GEMINI COMMAND ==================
        else if (command === '.gemini') {
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
                    const answer = data.message || data.data || data.answer || data.result;
                    if (answer) {
                        return await sock.sendMessage(chatId, { text: answer }, { quoted: message });
                    }
                } catch {}
            }

            return await sock.sendMessage(chatId, { text: "❌ All Gemini APIs failed." }, { quoted: message });
        }

        // ================== GPT2 COMMAND ==================
        else if (command === '.gpt2') {
            await sock.sendPresenceUpdate('composing', chatId);
            const response = await axios.get(`https://api.dreaded.site/api/chatgpt?text=${encodeURIComponent(query)}`);
            const prompt = response.data?.result?.prompt || "❌ No GPT2 response.";
            await sock.sendMessage(chatId, { text: prompt }, { quoted: message });
            await sock.sendPresenceUpdate('paused', chatId);
        }

        // ================== BILL COMMAND ==================
        else if (command === '.bill') {
            await sock.sendPresenceUpdate('composing', chatId);

            const payload = {
                refNo: query,
                secret_token: "token_4rpak_security",
                app_name: "RoshanPakistan"
            };

            // ✅ Call the API
            const response = await axios.post("https://bill.pitc.com.pk/bill/info", payload, {
                headers: { 'Content-Type': 'application/json' }
            });

            const data = response.data;

            if (!data || !data.consumerName) {
                return await sock.sendMessage(chatId, { text: "❌ No record found. Please check the reference number." }, { quoted: message });
            }

            // ✅ Extract and display similar to Bash script
            const consumerName = data.consumerName || "N/A";
            const fatherName = data.consumerFName || "N/A";
            const address = `${data.consumerAddress1 || ''} ${data.consumerAddress2 || ''}`;
            const refNo = data.refNo || query;
            const billMonth = data.billMonth || "N/A";
            const units = data.totCurCons || "N/A";
            const netBill = data.netBill || "N/A";
            const dueDate = data.billDueDate?.split('T')[0] || "N/A";
            const afterDue = data.currAmntDue || "N/A";
            const tariff = data.tariffDescription || "N/A";

            const billMessage = `
⚡ *Electricity Bill Details*
━━━━━━━━━━━━━━━━━━━━━━━
📌 *Consumer Name:* ${consumerName}
👤 *Father Name:* ${fatherName}
🏠 *Address:* ${address}
📑 *Reference No:* ${refNo}
📆 *Bill Month:* ${billMonth}
🔌 *Units Used:* ${units}
💡 *Net Bill:* Rs. ${netBill}
⏰ *Due Date:* ${dueDate}
💰 *After Due:* Rs. ${afterDue}
📊 *Tariff:* ${tariff}

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
