const { Events } = require("discord.js");
const { cleanAudioFolder } = require("../audio/queueManager");
const { clearAllMemory } = require("../ai/aiMemory");
const { start: startSpontaneousAI } = require("../ai/aiSpontaneous");

module.exports = function registerReadyEvent(client) {
    client.once(Events.ClientReady, () => {
        console.log(`✅ Logado como ${client.user.tag}`);
        // 🧹 Limpa resíduos de áudio de execuções passadas ao iniciar
        cleanAudioFolder();
        // 🧹 Zera a memória do modo de IA a cada nova sessão do bot
        clearAllMemory();
        // 🎲 Liga o relógio de interações espontâneas do Uriel
        startSpontaneousAI(client);
    });
};
