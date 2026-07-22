const fs = require("fs");
const path = require("path");

// Caminho do dicionário local de emojis (na raiz do projeto)
const EMOJIS_FILE = path.join(__dirname, "..", "..", "emojis.json");

let customEmojiDictionary = {};

// 📖 Carrega o dicionário de emojis local do arquivo JSON
function loadEmojiDictionary() {
    if (fs.existsSync(EMOJIS_FILE)) {
        try {
            const rawData = fs.readFileSync(EMOJIS_FILE, "utf-8");
            customEmojiDictionary = JSON.parse(rawData);
            console.log("📚 Dicionário de emojis (emojis.json) carregado com sucesso!");
        } catch (err) {
            console.error("❌ Erro ao ler o arquivo emojis.json:", err);
        }
    } else {
        console.warn("⚠️ Arquivo emojis.json não encontrado. Criando arquivo básico...");
        fs.writeFileSync(EMOJIS_FILE, JSON.stringify({}, null, 2), "utf-8");
    }
}

function getEmojiDictionary() {
    return customEmojiDictionary;
}

module.exports = {
    loadEmojiDictionary,
    getEmojiDictionary,
    EMOJIS_FILE
};
