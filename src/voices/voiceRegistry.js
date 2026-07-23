const fs = require("fs");
const path = require("path");

// Pasta onde ficam os arquivos de áudio de referência de cada voz clonada
const VOICES_DIR = path.join(__dirname, "..", "..", "voices");

// voices.json guarda os metadados de cada voz clonada — agora dentro da própria pasta voices/,
// pra ficar tudo junto e mais fácil de achar (metadados + referências, num só lugar).
// { "<voiceId>": { label, ownerId, guildId, referencePath, createdAt } }
const VOICES_FILE = path.join(VOICES_DIR, "voices.json");

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

// Remove uma voz clonada (metadados + pasta inteira com o arquivo de referência)
function deleteVoice(voiceId) {
    const voices = loadVoices();
    const meta = voices[voiceId];
    if (!meta) return false;

    const voiceDir = path.dirname(meta.referencePath);
    if (fs.existsSync(voiceDir)) {
        fs.rmSync(voiceDir, { recursive: true, force: true });
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