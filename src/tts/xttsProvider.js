const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

const { getVoice, getReferencePaths } = require("../voices/voiceRegistry");

const audioDir = path.join(__dirname, "..", "..", "audio");
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
}

const XTTS_SERVICE_URL = process.env.XTTS_SERVICE_URL;

// Gera fala usando uma voz clonada, chamando o microserviço Python que roda o XTTS2.
// voiceId: o id gerado pelo /clonevoice (referencia uma ou mais amostras salvas em voices/<voiceId>/)
async function generateSpeech(text, voiceId, language = "pt") {
    if (!XTTS_SERVICE_URL) {
        throw new Error("❌ XTTS_SERVICE_URL não configurada no .env — defina o endereço do serviço Python.");
    }

    const voiceMeta = getVoice(voiceId);
    if (!voiceMeta) {
        throw new Error(`❌ Voz clonada "${voiceId}" não encontrada no registro (voices.json).`);
    }

    const referencePaths = getReferencePaths(voiceMeta).filter(p => fs.existsSync(p));
    if (referencePaths.length === 0) {
        throw new Error(`❌ Nenhum arquivo de referência da voz "${voiceId}" encontrado em disco.`);
    }

    const form = new FormData();
    form.append("text", text);
    form.append("language", language);

    // Manda TODAS as amostras de referência dessa voz — o XTTS2 combina todas
    // pra montar uma condicionante mais rica (mesmo campo repetido = lista no FastAPI)
    for (const refPath of referencePaths) {
        form.append("reference_audio", fs.createReadStream(refPath));
    }

    const response = await axios.post(`${XTTS_SERVICE_URL}/synthesize`, form, {
        headers: form.getHeaders(),
        responseType: "arraybuffer",
        timeout: 120_000 // XTTS pode demorar, principalmente em CPU
    });

    const outputPath = path.join(audioDir, `speech-clone-${Date.now()}.wav`);
    fs.writeFileSync(outputPath, response.data);

    return outputPath;
}

module.exports = { generateSpeech };
