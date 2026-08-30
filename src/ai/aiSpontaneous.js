const { getVoiceConnection } = require("@discordjs/voice");

const { getGuildConfig } = require("../../configManager");
const { queueSpeech } = require("../audio/queueManager");
const { generateSpontaneousComment } = require("./aiHandler");

// A cada quanto tempo o Uriel GANHA A CHANCE de decidir se quer comentar algo.
// Isso não é um "cooldown" nem uma regra de quando ele DEVE falar — é só o
// intervalo técnico de checagem, já que não dá pra rodar isso a cada instante.
// Quem decide se vale a pena falar, a cada checagem, é o próprio modelo.
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

async function checkGuild(client, guildId) {
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
 * Liga o "relógio" de interações espontâneas. Chamar uma vez, no ready.js.
 * @param {import("discord.js").Client} client
 */
function start(client) {
    setInterval(() => {
        for (const guildId of client.guilds.cache.keys()) {
            checkGuild(client, guildId).catch(err =>
                console.error("❌ Erro na checagem de interação espontânea:", err.message || err)
            );
        }
    }, CHECK_INTERVAL_MS);

    console.log(`🎲 Interações espontâneas do Uriel ativadas (checagem a cada ${CHECK_INTERVAL_MS / 60000} min)`);
}

module.exports = { start };
