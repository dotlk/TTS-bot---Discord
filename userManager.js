const fs = require("fs");
const path = require("path");

// Caminho do arquivo de configuração
const configPath = path.join(
    __dirname,
    "config.json"
);

// Voz padrão do Edge TTS usada quando o usuário nunca configurou nada
const DEFAULT_VOICE = { type: "edge", value: "pt-BR-FranciscaNeural" };

// Lê o arquivo JSON
function loadConfig() {
    const data = fs.readFileSync(
        configPath,
        "utf8"
    );
    return JSON.parse(data);
}

// Salva alterações no JSON
function saveConfig(config) {
    fs.writeFileSync(
        configPath,
        JSON.stringify(
            config,
            null,
            4
        )
    );
}

// 🔄 Converte um valor antigo (string simples, ex: "pt-BR-FabioNeural") pro novo formato de objeto.
// Se já estiver no formato novo ({ type, value }), retorna sem alterar.
function normalizeVoiceEntry(entry) {
    if (!entry) return null;

    if (typeof entry === "string") {
        return { type: "edge", value: entry };
    }

    return entry;
}

// Retorna a configuração de um servidor
function getGuildConfig(guildId) {
    const config = loadConfig();

    // Se o servidor ainda não possui configuração
    if (!config[guildId]) {
        config[guildId] = {
            channelId: null,
            mode: "all",
            announceAuthor: true,
            userVoices: {} // Adicionado mapa de vozes por padrão
        };

        saveConfig(config);
    }

    // Garante que a propriedade userVoices exista mesmo em servidores antigos
    if (!config[guildId].userVoices) {
        config[guildId].userVoices = {};
        saveConfig(config);
    }

    // 🔄 Migra vozes salvas no formato antigo (string) pro novo formato ({ type, value })
    let migrated = false;
    for (const userId of Object.keys(config[guildId].userVoices)) {
        const rawEntry = config[guildId].userVoices[userId];
        if (typeof rawEntry === "string") {
            config[guildId].userVoices[userId] = normalizeVoiceEntry(rawEntry);
            migrated = true;
        }
    }
    if (migrated) {
        saveConfig(config);
    }

    return config[guildId];
}

// Atualiza configurações
function updateGuildConfig(
    guildId,
    data
) {
    const config = loadConfig();

    config[guildId] = {
        ...getGuildConfig(guildId),
        ...data
    };

    saveConfig(config);
}

// Retorna a voz do usuário no formato { type: "edge" | "clone", value: string }
// (ou a voz padrão do Edge, se ele nunca configurou nada)
function getUserVoice(guildId, userId) {
    const guildConfig = getGuildConfig(guildId);
    const normalized = normalizeVoiceEntry(guildConfig.userVoices[userId]);
    return normalized || DEFAULT_VOICE;
}

// Salva a voz escolhida pelo usuário.
// Aceita tanto uma string simples (voz do Edge, mantém compatibilidade com o /voice atual)
// quanto um objeto { type: "clone", value: voiceId } (usado a partir do /clonevoice).
function setUserVoice(guildId, userId, voice) {
    const guildConfig = getGuildConfig(guildId);

    guildConfig.userVoices[userId] = normalizeVoiceEntry(voice);

    updateGuildConfig(guildId, {
        userVoices: guildConfig.userVoices
    });
}

module.exports = {
    getGuildConfig,
    updateGuildConfig,
    getUserVoice,
    setUserVoice
};
