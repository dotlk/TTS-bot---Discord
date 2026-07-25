const fs = require("fs");
const path = require("path");

// Pasta onde ficam os arquivos de áudio de referência de cada voz clonada
const VOICES_DIR = path.join(__dirname, "..", "..", "voices");

// Os arquivos de áudio seguem a organização em disco: voices/<guildId>/<voiceId>/*.mp3
const VOICES_FILE = path.join(VOICES_DIR, "voices.json");

function ensureFiles() {
    if (!fs.existsSync(VOICES_DIR)) {
        fs.mkdirSync(VOICES_DIR, { recursive: true });
    }
    if (!fs.existsSync(VOICES_FILE)) {
        fs.writeFileSync(VOICES_FILE, JSON.stringify({}, null, 4), "utf-8");
    }
}

// Migra o formato ANTIGO (voiceId como chave de topo, com guildId dentro de cada voz)
// pro formato NOVO (guildId como chave de topo). Detecta o formato antigo verificando
// se alguma entrada de topo tem uma propriedade "guildId" (só voz tem isso, guild não).
function migrateIfNeeded(raw) {
    const topLevelKeys = Object.keys(raw);
    const looksLikeOldFormat = topLevelKeys.some(key => raw[key] && typeof raw[key].guildId === "string");

    if (!looksLikeOldFormat) {
        return { data: raw, migrated: false };
    }

    const migrated = {};
    for (const [voiceId, meta] of Object.entries(raw)) {
        const { guildId, ...rest } = meta;
        if (!migrated[guildId]) migrated[guildId] = {};
        migrated[guildId][voiceId] = rest;
    }

    return { data: migrated, migrated: true };
}

function loadVoices() {
    ensureFiles();
    const raw = JSON.parse(fs.readFileSync(VOICES_FILE, "utf-8"));
    const { data, migrated } = migrateIfNeeded(raw);

    if (migrated) {
        saveVoices(data);
        console.log("🔄 voices.json migrado pro novo formato (organizado por servidor).");
    }

    return data;
}

function saveVoices(voices) {
    fs.writeFileSync(VOICES_FILE, JSON.stringify(voices, null, 4), "utf-8");
}

// 🔄 Vozes criadas antes do suporte a múltiplas amostras guardavam um único
// "referencePath" (string). Essa função devolve sempre uma lista.
function getReferencePaths(meta) {
    if (!meta) return [];
    if (Array.isArray(meta.referencePaths) && meta.referencePaths.length > 0) {
        return meta.referencePaths;
    }
    if (meta.referencePath) {
        return [meta.referencePath];
    }
    return [];
}

// Acha em qual servidor um voiceId está registrado. Retorna { guildId, meta } ou null.
function findVoiceOwner(voices, voiceId) {
    for (const [guildId, guildVoices] of Object.entries(voices)) {
        if (guildVoices[voiceId]) {
            return { guildId, meta: guildVoices[voiceId] };
        }
    }
    return null;
}

// Retorna os metadados de uma voz clonada específica (ou null se não existir).
// Busca em todos os servidores — voiceId é um UUID único, não há ambiguidade.
function getVoice(voiceId) {
    const voices = loadVoices();
    const found = findVoiceOwner(voices, voiceId);
    return found ? { ...found.meta, guildId: found.guildId } : null;
}

// Lista todas as vozes clonadas de um servidor (opcionalmente filtrando por dono)
function listVoices(guildId, ownerId = null) {
    const voices = loadVoices();
    const guildVoices = voices[guildId] || {};

    return Object.entries(guildVoices)
        .filter(([, meta]) => !ownerId || meta.ownerId === ownerId)
        .map(([voiceId, meta]) => ({ voiceId, ...meta }));
}

// Registra uma nova voz clonada (com a primeira amostra). Retorna o voiceId gerado.
function registerVoice({ voiceId, label, ownerId, guildId, referencePath }) {
    const voices = loadVoices();

    if (!voices[guildId]) voices[guildId] = {};

    voices[guildId][voiceId] = {
        label,
        ownerId,
        referencePaths: [referencePath],
        createdAt: new Date().toISOString()
    };

    saveVoices(voices);
    return voiceId;
}

// ✨ Adiciona mais uma amostra de referência numa voz já existente (comando /enriquecervoice).
// Retorna o total de amostras que a voz passa a ter, ou null se a voz não existir.
function addVoiceSample(voiceId, newReferencePath) {
    const voices = loadVoices();
    const found = findVoiceOwner(voices, voiceId);
    if (!found) return null;

    const { guildId, meta } = found;
    const updatedPaths = [...getReferencePaths(meta), newReferencePath];

    voices[guildId][voiceId] = {
        ...meta,
        referencePaths: updatedPaths
    };
    delete voices[guildId][voiceId].referencePath; // limpa o campo antigo, se existia

    saveVoices(voices);
    return updatedPaths.length;
}

// Remove uma voz clonada (metadados + pasta inteira com todos os arquivos de referência)
function deleteVoice(voiceId) {
    const voices = loadVoices();
    const found = findVoiceOwner(voices, voiceId);
    if (!found) return false;

    const { guildId, meta } = found;
    const paths = getReferencePaths(meta);
    if (paths.length > 0) {
        const voiceDir = path.dirname(paths[0]);
        if (fs.existsSync(voiceDir)) {
            fs.rmSync(voiceDir, { recursive: true, force: true });
        }
    }

    delete voices[guildId][voiceId];

    // Se o servidor ficou sem nenhuma voz, remove a chave do servidor E a pasta vazia em disco
    if (Object.keys(voices[guildId]).length === 0) {
        delete voices[guildId];

        const guildDir = path.join(VOICES_DIR, guildId);
        if (fs.existsSync(guildDir)) {
            fs.rmSync(guildDir, { recursive: true, force: true });
        }
    }

    saveVoices(voices);
    return true;
}

module.exports = {
    VOICES_DIR,
    getVoice,
    listVoices,
    registerVoice,
    addVoiceSample,
    getReferencePaths,
    deleteVoice
};