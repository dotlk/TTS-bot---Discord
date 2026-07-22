require("dotenv").config();

const ffmpegPath = require("ffmpeg-static");
process.env.FFMPEG_PATH = ffmpegPath;

const client = require("./src/discord/client");
const { loadEmojiDictionary } = require("./src/text/emojiDictionary");

// Carrega o dicionário de emojis customizados antes de tudo
loadEmojiDictionary();

// Registra os handlers de evento
require("./src/events/ready")(client);
require("./src/events/messageCreate")(client);
require("./src/events/interactionCreate")(client);

console.log("🚀 Tentando conectar...");

client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log("✅ Login concluído!"))
    .catch(error => console.error("❌ Erro ao conectar:", error));
