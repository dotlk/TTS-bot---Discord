const { Events } = require("discord.js");

const { getGuildConfig } = require("../../configManager");
const { formatTextForTTS } = require("../text/formatText");
const { queueSpeech, getLastSpeaker, setLastSpeaker } = require("../audio/queueManager");

module.exports = function registerMessageCreateEvent(client) {
    client.on(Events.MessageCreate, async (message) => {
        if (message.author.bot) return;

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
