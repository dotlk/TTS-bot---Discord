const fs = require("fs");
const path = require("path");

const {
    getVoiceConnection,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    StreamType,
    VoiceConnectionStatus
} = require("@discordjs/voice");

const { generateSpeech } = require("../tts/ttsRouter");
const { getUserVoice } = require("../../configManager");

// Pasta onde os áudios temporários são salvos
const AUDIO_DIR = path.join(__dirname, "..", "..", "audio");

const players = new Map();
// Estrutura da Fila: Map<guildId, Array<{ text, userId, ready, readyAt, audioPath, audioPromise }>>
const audioQueues = new Map();
const isPlayingMap = new Map();
const lastSpeakerMap = new Map();

// 🧹 Limpa arquivos MP3 não utilizados no diretório de áudio
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

// 🧹 Apaga todos os MP3 pendentes de uma fila específica ao cancelar/sair
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

// Retorna o player existente sem criar um novo (útil para comandos como /skip)
function getExistingPlayer(guildId) {
    return players.get(guildId);
}

function queueSpeech(text, guildId, userId) {
    if (!audioQueues.has(guildId)) {
        audioQueues.set(guildId, []);
    }

    // userVoice agora é um objeto: { type: "edge" | "clone", value: string }
    const userVoice = getUserVoice(guildId, userId);
    console.log(`⚡ [${userVoice.type}:${userVoice.value}] Pré-gerando áudio em background para o usuário ${userId}: "${text}"`);

    // O item guarda seu próprio estado de "pronto" (ready/readyAt/audioPath),
    // pra fila poder tocar quem terminar de gerar primeiro — não necessariamente quem chegou primeiro.
    const item = { text, userId, ready: false, audioPath: null, readyAt: null };

    item.audioPromise = generateSpeech(text, userVoice)
        .then(audioPath => {
            item.audioPath = audioPath;
            item.ready = true;
            item.readyAt = Date.now();
            return audioPath;
        })
        .catch(err => {
            console.error("❌ Erro ao pré-gerar MP3:", err.message || err);
            item.audioPath = null;
            item.ready = true;
            item.readyAt = Date.now();
            return null;
        });

    audioQueues.get(guildId).push(item);
    processQueue(guildId);
}

// Escolhe, entre os itens já prontos na fila, o que terminou de gerar primeiro
function pickNextReady(queue) {
    const readyItems = queue.filter(item => item.ready);
    if (readyItems.length === 0) return null;

    return readyItems.reduce((earliest, item) =>
        item.readyAt < earliest.readyAt ? item : earliest
    );
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

    // Tenta achar algo que já esteja pronto. Se nada estiver pronto ainda,
    // espera até QUALQUER item da fila terminar de gerar (o primeiro a resolver "ganha" a vez).
    let nextItem = pickNextReady(queue);
    if (!nextItem) {
        await Promise.race(queue.map(item => item.audioPromise));
        nextItem = pickNextReady(queue);
    }

    // Corrida rara (ex: a fila foi esvaziada por um /leave enquanto esperava) — tenta de novo
    if (!nextItem) {
        isPlayingMap.set(guildId, false);
        return processQueue(guildId);
    }

    queue.splice(queue.indexOf(nextItem), 1);
    const { audioPath } = nextItem;

    try {
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

function isGuildPlaying(guildId) {
    return !!isPlayingMap.get(guildId);
}

function getLastSpeaker(guildId) {
    return lastSpeakerMap.get(guildId);
}

function setLastSpeaker(guildId, userId) {
    lastSpeakerMap.set(guildId, userId);
}

// Limpa o estado de "tocando" e "último autor" de um servidor (usado ao sair da call)
function resetGuildState(guildId) {
    isPlayingMap.delete(guildId);
    lastSpeakerMap.delete(guildId);
}

module.exports = {
    AUDIO_DIR,
    cleanAudioFolder,
    clearGuildQueue,
    getPlayer,
    getExistingPlayer,
    queueSpeech,
    processQueue,
    isGuildPlaying,
    getLastSpeaker,
    setLastSpeaker,
    resetGuildState
};