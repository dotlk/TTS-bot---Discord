// userManager.js
const fs = require("fs");
const path = require("path");

const USERS_FILE = path.join(__dirname, "userConfigs.json");

// Garante que o arquivo JSON existe
function loadUserConfigs() {
    if (!fs.existsSync(USERS_FILE)) {
        fs.writeFileSync(USERS_FILE, JSON.stringify({}));
        return {};
    }
    try {
        const data = fs.readFileSync(USERS_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

function getUserVoice(userId) {
    const configs = loadUserConfigs();
    // Retorna a voz salva
    return configs[userId]?.voice;
}

function setUserVoice(userId, voiceName) {
    const configs = loadUserConfigs();
    configs[userId] = { ...configs[userId], voice: voiceName };
    fs.writeFileSync(USERS_FILE, JSON.stringify(configs, null, 2));
}

module.exports = {
    getUserVoice,
    setUserVoice
};