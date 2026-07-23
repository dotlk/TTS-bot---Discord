const fs = require("fs");
const path = require("path");

// voices.json guarda os metadados de cada voz clonada:
// { "<voiceId>": { label, ownerId, guildId, referencePath, createdAt } }
const VOICES_FILE = path.join(__dirname, "..", "..", "voices.json");

// Pasta onde ficam os arquivos de áudio de referência de cada voz clonada
const VOICES_DIR = path.join(__dirname, "..", "..", "voices");

function ensureFiles() {
    if (!fs.existsSync(VOICES_DIR)) {
        fs.mkdirSync(VOICES_DIR, { recursive: true });
    }
    if (!fs.existsSync(VOICES_FILE)) {
        fs.writeFileSync(VOICES_FILE, JSON.stringify({}, null, 4), "utf-8");
    }
}

function loadVoices() {
    ensureFiles();
    const data = fs.readFileSync(VOICES_FILE, "utf-8");
    return JSON.parse(data);
}

function saveVoices(voices) {
    fs.writeFileSync(VOICES_FILE, JSON.stringify(voices, null, 4), "utf-8");
}

// Retorna os metadados de uma voz clonada específica (ou null se não existir)
function getVoice(voiceId) {
    const voices = loadVoices();
    return voices[voiceId] || null;
}

// Lista todas as vozes clonadas de um servidor (opcionalmente filtrando por dono)
function listVoices(guildId, ownerId = null) {
    const voices = loadVoices();

    return Object.entries(voices)
        .filter(([, meta]) => meta.guildId === guildId && (!ownerId || meta.ownerId === ownerId))
        .map(([voiceId, meta]) => ({ voiceId, ...meta }));
}

// Registra uma nova voz clonada. Retorna o voiceId gerado.
function registerVoice({ voiceId, label, ownerId, guildId, referencePath }) {
    const voices = loadVoices();

    voices[voiceId] = {
        label,
        ownerId,
        guildId,
        referencePath,
        createdAt: new Date().toISOString()
    };

    saveVoices(voices);
    return voiceId;
}

// Remove uma voz clonada (metadados + arquivo de referência, se existir)
function deleteVoice(voiceId) {
    const voices = loadVoices();
    const meta = voices[voiceId];
    if (!meta) return false;

    if (meta.referencePath && fs.existsSync(meta.referencePath)) {
        fs.unlinkSync(meta.referencePath);
    }

    delete voices[voiceId];
    saveVoices(voices);
    return true;
}

module.exports = {
    VOICES_DIR,
    getVoice,
    listVoices,
    registerVoice,
    deleteVoice
};
