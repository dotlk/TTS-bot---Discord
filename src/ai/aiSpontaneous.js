const { getVoiceConnection } = require("@discordjs/voice");

const { getGuildConfig } = require("../../configManager");
const { queueSpeech } = require("../audio/queueManager");
const { updateEmitter } = require("./aiMemory");
const { generateSpontaneousComment } = require("./aiHandler");

async function handleActivity(client, guildId) {
    const config = getGuildConfig(guildId);
    if (!config || !config.channelId) return;

    const comment = await generateSpontaneousComment(guildId);
    if (!comment) return; // o Uriel decidiu ficar quieto dessa vez

    const channel = client.channels.cache.get(config.channelId);
    if (!channel) return;

    await channel.send(comment).catch(err =>
        console.error("❌ Erro ao enviar comentário espontâneo:", err.message || err)
    );

    // 🔊 Fala também, se estiver em call nesse canal (mesma regra do modo de IA normal)
    const connection = getVoiceConnection(guildId);
    if (connection) {
        queueSpeech(comment, guildId, client.user.id);
    }
}

/**
 * Liga as interações espontâneas: em vez de um timer de tempo fixo, escuta
 * o evento "activity" que o aiMemory.js emite sempre que a memória de um
 * servidor acumula um certo número de atualizações (ver UPDATES_BEFORE_CHANCE
 * em aiMemory.js). Cada vez que isso acontece, o Uriel ganha a CHANCE de
 * comentar — mas quem decide se fala é o próprio modelo, dentro de
 * generateSpontaneousComment.
 * @param {import("discord.js").Client} client
 */
function start(client) {
    updateEmitter.on("activity", (guildId) => {
        handleActivity(client, guildId).catch(err =>
            console.error("❌ Erro na interação espontânea:", err.message || err)
        );
    });

    console.log("🎲 Interações espontâneas do Uriel ligadas à atividade da memória.");
}

module.exports = { start };
