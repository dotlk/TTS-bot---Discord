const { Events } = require("discord.js");

const { getGuildConfig } = require("../../configManager");
const { formatTextForTTS } = require("../text/formatText");
const { queueSpeech, getLastSpeaker, setLastSpeaker } = require("../audio/queueManager");
const { handleAIMode } = require("../ai/aiHandler");
const { appendToLog } = require("../ai/aiMemory");

module.exports = function registerMessageCreateEvent(client) {
    client.on(Events.MessageCreate, async (message) => {
        if (message.author.bot) return;

        const authorName = message.member?.displayName || message.author.username;

        // 🤖 Modo de IA: só ativa se a menção ao bot for o PRIMEIRO elemento
        // da mensagem (ignorando espaços) e sobrar algo depois dela.
        // Se a menção vier no meio/fim do texto, ou não sobrar pergunta
        // nenhuma, o fluxo cai pro tratamento normal de TTS abaixo.
        const mentionRegex = new RegExp(`^<@!?${client.user.id}>`);
        const trimmedContent = message.content.trim();

        if (mentionRegex.test(trimmedContent)) {
            const question = trimmedContent.replace(mentionRegex, "").trim();
            if (question) {
                // Não loga aqui — o handleAIMode/generateAIResponse já salva
                // a pergunta (sem a menção) e a resposta no histórico.
                return handleAIMode(message, question);
            }
            return; // menção "vazia" (só chamou o bot) — não faz nada
        }

        // 📝 Mensagens normais (que não ativaram o modo de IA) entram no
        // histórico completo do Uriel, pra ele ter contexto do que rola no
        // servidor mesmo sem ser mencionado diretamente.
        if (trimmedContent) {
            appendToLog(message.guild.id, { role: "user", content: `${authorName}: ${trimmedContent}` });
        }

        const config = getGuildConfig(message.guild.id);
        if (!config || !config.channelId || message.channel.id !== config.channelId) return;

        let text = formatTextForTTS(message);

        if (config.mode === "prefix") {
            if (!text.startsWith(config.prefix)) return;
            text = text.slice(config.prefix.length).trim();
        }

        if (!text) return;

        if (config.announceAuthor) {
            const lastSpeaker = getLastSpeaker(message.guild.id);

            if (lastSpeaker !== message.author.id) {
                text = `${message.author.username} disse: ${text}`;
                setLastSpeaker(message.guild.id, message.author.id);
            }
        }

        console.log("🔊 Enviando para a fila de TTS:", text);
        queueSpeech(text, message.guild.id, message.author.id);
    });
};
