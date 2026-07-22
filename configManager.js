const fs = require("fs");
const path = require("path");

// Caminho do arquivo de configuração
const configPath = path.join(
    __dirname,
    "config.json"
);

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

// Retorna a voz do usuário (ou Francisca se não definiu nenhuma)
function getUserVoice(guildId, userId) {
    const guildConfig = getGuildConfig(guildId);
    return guildConfig.userVoices[userId] || "pt-BR-FranciscaNeural";
}

// Salva a voz escolhida pelo usuário
function setUserVoice(guildId, userId, voice) {
    const guildConfig = getGuildConfig(guildId);
    
    guildConfig.userVoices[userId] = voice;

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