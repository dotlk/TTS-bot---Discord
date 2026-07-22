require("dotenv").config();

const fs = require("fs");
const path = require("path");
const ffmpegPath = require("ffmpeg-static");
process.env.FFMPEG_PATH = ffmpegPath;

const {
    Client,
    GatewayIntentBits,
    Events
} = require("discord.js");

const {
    joinVoiceChannel,
    getVoiceConnection,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    StreamType,
    entersState,
    VoiceConnectionStatus
} = require("@discordjs/voice");

const { generateSpeech } = require("./tts");

// Importa gemoji para traduzir emojis Unicode
const gemojiModule = require("gemoji");
const unicodeToEmoji = gemojiModule ? gemojiModule.unicodeToEmoji : undefined;

// Importa as funções do configManager
const { 
    updateGuildConfig, 
    getGuildConfig, 
    getUserVoice, 
    setUserVoice 
} = require("./configManager");

const players = new Map();
// Estrutura da Fila: Map<guildId, Array<{ text: string, userId: string, audioPromise: Promise<string> }>>
const audioQueues = new Map();
const isPlayingMap = new Map();
const lastSpeakerMap = new Map();

// Pasta onde os áudios temporários são salvos
const AUDIO_DIR = path.join(__dirname, "audio");

// 📖 Carrega o dicionário de emojis local do arquivo JSON
const EMOJIS_FILE = path.join(__dirname, "emojis.json");
let customEmojiDictionary = {};

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

// Executa o carregamento inicial do JSON
loadEmojiDictionary();

// 🧹 FUNÇÃO: Limpa arquivos MP3 não utilizados no diretório de áudio
function cleanAudioFolder() {
    if (!fs.existsSync(AUDIO_DIR)) return;

    fs.readdir(AUDIO_DIR, (err, files) => {
        if (err) return console.error("❌ Erro ao ler pasta de áudios:", err);

        for (const file of files) {
            if (file.endsWith(".mp3")) {
                const filePath = path.join(AUDIO_DIR, file);
                fs.unlink(filePath, (unlinkErr) => {
                    if (!unlinkErr) console.log(`🧹 Áudio antigo/órfão removido: ${file}`);
                });
            }
        }
    });
}

// 🧹 FUNÇÃO: Apaga todos os MP3 pendentes de uma fila específica ao cancelar/sair
async function clearGuildQueue(guildId) {
    const queue = audioQueues.get(guildId);
    if (!queue) return;

    for (const item of queue) {
        try {
            const audioPath = await item.audioPromise;
            if (audioPath && fs.existsSync(audioPath)) {
                fs.unlink(audioPath, (err) => {
                    if (!err) console.log(`🗑️ Áudio cancelado excluído: ${audioPath}`);
                });
            }
        } catch (e) {
            // Ignora se o áudio nem chegou a ser gerado
        }
    }

    audioQueues.delete(guildId);
}

// 🔤 Converte qualquer emoji Unicode para o seu nome correspondente em PT-BR
function replaceUnicodeEmojisWithNames(text) {
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F7FF}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

    return text.replace(emojiRegex, (match) => {
        try {
            // 1. Checa se o emoji direto está no arquivo emojis.json
            if (customEmojiDictionary && customEmojiDictionary[match]) {
                return ` ${customEmojiDictionary[match]} `;
            }

            // 2. Garante que unicodeToEmoji existe antes de buscar na biblioteca gemoji
            if (typeof unicodeToEmoji !== "undefined" && unicodeToEmoji && unicodeToEmoji[match]) {
                const emojiData = unicodeToEmoji[match];
                if (emojiData && emojiData.name) {
                    const englishName = emojiData.name;

                    // Checa se o nome em inglês está mapeado no emojis.json
                    const mappedName = customEmojiDictionary ? customEmojiDictionary[englishName] : null;
                    if (mappedName) {
                        return ` ${mappedName} `;
                    }

                    // Fallback: Limpa o nome em inglês (ex: grinning_face -> grinning face)
                    return ` ${englishName.replace(/[-_]/g, " ")} `;
                }
            }

            // 3. Se não encontrou em lugar nenhum, ignora o emoji de forma segura
            return "";
        } catch (err) {
            console.error(`⚠️ Erro ao processar o emoji "${match}":`, err.message);
            return ""; // Em caso de qualquer imprevisto, ignora o emoji e previne o crash do bot
        }
    });
}

function formatTextForTTS(message) {
    let rawText = message.content.trim();

    const onlyMentionsRegex = /^(?:<[a-z@#!&]?:?\w+:?\d+>|\s+)+$/i;
    if (onlyMentionsRegex.test(rawText)) {
        return "";
    }

    let text = rawText;

    text = text.replace(/<@(&?|!?)(\d+)>/g, (match, prefix, id) => {
        if (prefix === "&") {
            const role = message.guild.roles.cache.get(id);
            return role ? `@${role.name}` : "";
        } else {
            const member = message.guild.members.cache.get(id);
            return member ? `@${member.displayName}` : "";
        }
    });

    text = text.replace(/<#(\d+)>/g, (match, channelId) => {
        const channel = message.guild.channels.cache.get(channelId);
        return channel ? `#${channel.name}` : "";
    });

    // Trata emojis customizados do Discord (<:nome:id> ou <a:nome:id>)
    text = text.replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, (match, emojiName) => {
        const mappedName = (customEmojiDictionary && customEmojiDictionary[emojiName]) || emojiName.replace(/[-_]/g, " ");
        return ` ${mappedName} `;
    });

    text = replaceUnicodeEmojisWithNames(text);

    return text.trim();
}

function getPlayer(guildId) {
    if (!players.has(guildId)) {
        const player = createAudioPlayer();

        player.on("stateChange", (oldState, newState) => {
            console.log(`🎵 ${guildId}: ${oldState.status} -> ${newState.status}`);
        });

        player.on("error", error => {
            console.error("❌ Player error:", error);
            isPlayingMap.set(guildId, false);
            processQueue(guildId);
        });

        players.set(guildId, player);
    }

    return players.get(guildId);
}

function queueSpeech(text, guildId, userId) {
    if (!audioQueues.has(guildId)) {
        audioQueues.set(guildId, []);
    }

    const userVoice = getUserVoice(guildId, userId);
    console.log(`⚡ [${userVoice}] Pré-gerando áudio em background para o usuário ${userId}: "${text}"`);

    const audioPromise = generateSpeech(text, userVoice).catch(err => {
        console.error("❌ Erro ao pré-gerar MP3:", err);
        return null;
    });

    audioQueues.get(guildId).push({ text, userId, audioPromise });
    processQueue(guildId);
}

async function processQueue(guildId) {
    if (isPlayingMap.get(guildId)) return;

    const queue = audioQueues.get(guildId);
    if (!queue || queue.length === 0) return;

    const connection = getVoiceConnection(guildId);
    if (!connection || connection.state.status !== VoiceConnectionStatus.Ready) {
        console.log("⚠️ Bot não está conectado ou não está pronto no canal de voz.");
        return;
    }

    isPlayingMap.set(guildId, true);
    
    const { text, userId, audioPromise } = queue.shift();

    try {
        const audioPath = await audioPromise;

        if (!audioPath || !fs.existsSync(audioPath)) {
            console.error("❌ Arquivo de áudio inválido ou não encontrado.");
            isPlayingMap.set(guildId, false);
            return processQueue(guildId);
        }

        const stream = fs.createReadStream(audioPath);
        const resource = createAudioResource(stream, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true
        });

        const player = getPlayer(guildId);
        connection.subscribe(player);
        player.play(resource);

        const onStateChange = (oldState, newState) => {
            if (newState.status === AudioPlayerStatus.Idle) {
                player.off("stateChange", onStateChange);

                // 🗑️ Deleta o arquivo temporário após ser tocado
                if (fs.existsSync(audioPath)) {
                    fs.unlink(audioPath, (err) => {
                        if (err) console.error(`❌ Erro ao deletar o arquivo ${audioPath}:`, err);
                        else console.log(`🗑️ Arquivo temporário removido: ${audioPath}`);
                    });
                }

                isPlayingMap.set(guildId, false);
                processQueue(guildId);
            }
        };

        player.on("stateChange", onStateChange);

    } catch (error) {
        console.error("❌ Erro ao reproduzir o TTS na fila:", error);
        isPlayingMap.set(guildId, false);
        processQueue(guildId);
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    const config = getGuildConfig(message.guild.id);
    if (!config || !config.channelId || message.channel.id !== config.channelId) return;

    let text = formatTextForTTS(message);

    if (config.mode === "prefix") {
        if (!text.startsWith(config.prefix)) return;
        text = text.slice(config.prefix.length).trim();
    }

    if (!text) return;

    if (config.announceAuthor) {
        const lastSpeaker = lastSpeakerMap.get(message.guild.id);

        if (lastSpeaker !== message.author.id) {
            text = `${message.author.username} disse: ${text}`;
            lastSpeakerMap.set(message.guild.id, message.author.id);
        }
    }

    console.log("🔊 Enviando para a fila de TTS:", text);
    queueSpeech(text, message.guild.id, message.author.id);
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    switch (interaction.commandName) {
        case "join": {
            const voiceChannel = interaction.member.voice.channel;

            if (!voiceChannel) {
                return interaction.reply({
                    content: "❌ Você precisa entrar em um canal de voz primeiro.",
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            try {
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: interaction.guild.id,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                    selfDeaf: false,
                    selfMute: false
                });

                await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

                const player = getPlayer(interaction.guild.id);
                connection.subscribe(player);

                console.log("🔌 Estado da conexão: READY");
                await interaction.editReply(`✅ Entrei em **${voiceChannel.name}**!`);
            } catch (error) {
                console.error("❌ Erro ao conectar na voz:", error);
                await interaction.editReply("❌ Falha ao conectar ao canal de voz.");
            }

            break;
        }

        case "skip": {
            const player = players.get(interaction.guild.id);
            const isPlaying = isPlayingMap.get(interaction.guild.id);

            if (!player || !isPlaying) {
                return interaction.reply({
                    content: "⚠️ Não há nenhum áudio tocando no momento para pular.",
                    ephemeral: true
                });
            }

            player.stop();
            await interaction.reply("⏭️ Áudio pulado!");
            break;
        }

        case "voice": {
            await interaction.deferReply({ ephemeral: true });

            const chosenVoice = interaction.options.getString("voz");
            setUserVoice(interaction.guild.id, interaction.user.id, chosenVoice);

            await interaction.editReply({
                content: `✅ Sua voz individual foi definida como **${chosenVoice}**!`
            });
            break;
        }

        case "setchannel": {
            await interaction.deferReply();

            const channel = interaction.options.getChannel("canal");
            updateGuildConfig(interaction.guild.id, { channelId: channel.id });

            await interaction.editReply(`✅ Canal configurado para TTS: ${channel}`);
            break;
        }

        case "mode": {
            await interaction.deferReply();

            const mode = interaction.options.getString("tipo");
            updateGuildConfig(interaction.guild.id, { mode: mode });

            await interaction.editReply(`✅ Modo alterado para **${mode}**`);
            break;
        }

        case "prefix": {
            await interaction.deferReply();

            const prefix = interaction.options.getString("simbolo");
            updateGuildConfig(interaction.guild.id, { prefix: prefix });

            await interaction.editReply(`✅ Prefixo definido como **${prefix}**`);
            break;
        }

        case "author": {
            await interaction.deferReply();

            const enabled = interaction.options.getBoolean("ativado");
            updateGuildConfig(interaction.guild.id, { announceAuthor: enabled });

            await interaction.editReply(`✅ Nome do autor: **${enabled ? "ativado" : "desativado"}**`);
            break;
        }

        case "leave": {
            const connection = getVoiceConnection(interaction.guild.id);

            if (!connection) {
                return interaction.reply({
                    content: "❌ Não estou conectado a um canal de voz.",
                    ephemeral: true
                });
            }

            // 🧹 Limpa os arquivos de áudio não tocados da fila antes de sair
            await clearGuildQueue(interaction.guild.id);

            isPlayingMap.delete(interaction.guild.id);
            lastSpeakerMap.delete(interaction.guild.id);

            connection.destroy();
            await interaction.reply("👋 Saí do canal de voz!");
            break;
        }

        default:
            break;
    }
});

client.once(Events.ClientReady, () => {
    console.log(`✅ Logado como ${client.user.tag}`);
    // 🧹 Limpa resíduos de áudio de execuções passadas ao iniciar
    cleanAudioFolder();
});

console.log("🚀 Tentando conectar...");

client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log("✅ Login concluído!"))
    .catch(error => console.error("❌ Erro ao conectar:", error));