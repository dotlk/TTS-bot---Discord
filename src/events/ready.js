const { Events } = require("discord.js");
const { cleanAudioFolder } = require("../audio/queueManager");

module.exports = function registerReadyEvent(client) {
    client.once(Events.ClientReady, () => {
        console.log(`✅ Logado como ${client.user.tag}`);
        // 🧹 Limpa resíduos de áudio de execuções passadas ao iniciar
        cleanAudioFolder();
    });
};
