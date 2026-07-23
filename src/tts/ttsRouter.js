const edgeProvider = require("./edgeProvider");
const xttsProvider = require("./xttsProvider");

// 🔀 Decide qual provedor de TTS usar de acordo com o tipo de voz configurado pelo usuário.
// voiceConfig: { type: "edge" | "clone", value: string }
async function generateSpeech(text, voiceConfig) {
    // Compatibilidade extra: se por algum motivo chegar uma string pura, trata como voz do Edge
    if (!voiceConfig || typeof voiceConfig !== "object") {
        return edgeProvider.generateSpeech(text, voiceConfig);
    }

    switch (voiceConfig.type) {
        case "clone":
            return xttsProvider.generateSpeech(text, voiceConfig.value);

        case "edge":
        default:
            return edgeProvider.generateSpeech(text, voiceConfig.value);
    }
}

module.exports = { generateSpeech };
