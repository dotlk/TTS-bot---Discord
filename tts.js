const { EdgeTTS } = require("@andresaya/edge-tts");
const path = require("path");
const fs = require("fs");

// Garante que a pasta 'audio' existe UMA ÚNICA VEZ ao iniciar o módulo
const audioDir = path.join(__dirname, "audio");
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
}

async function generateSpeech(text, voice = "pt-BR-FranciscaNeural") {
    const tts = new EdgeTTS();

    await tts.synthesize(text, voice, {
        outputFormat: "audio-24khz-48kbitrate-mono-mp3"
    });

    const outputWithoutExt = path.join(audioDir, `speech-${Date.now()}`);
    await tts.toFile(outputWithoutExt);

    return `${outputWithoutExt}.mp3`;
}

module.exports = { generateSpeech };