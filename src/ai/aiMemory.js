const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");

// Histórico COMPLETO por servidor, desde que o bot ligou (ver clearAllMemory,
// chamada no ready.js, que zera tudo a cada início). Vive só em disco, sem
// cache em RAM — cada leitura/escrita toca o arquivo direto, por precaução
// (evita o processo do bot crescer de memória indefinidamente com o tempo).
const MEMORY_DIR = path.join(__dirname, "memoria");

// Quantas entradas do histórico completo são mandadas pro modelo a cada
// pergunta. O arquivo em disco guarda TUDO; isso aqui só limita o que vai
// no prompt, pra manter a resposta rápida mesmo com o histórico crescendo.
const CONTEXT_WINDOW = 30;

// A cada quantas ATUALIZAÇÕES na memória (mensagens novas, de qualquer tipo)
// o Uriel ganha a chance de decidir se quer comentar algo por conta própria.
// Não é tempo, é volume de atividade real — ver aiSpontaneous.js, que escuta
// o evento "activity" emitido aqui.
const UPDATES_BEFORE_CHANCE = 5;

// Só guarda um número por servidor (quantas atualizações desde a última
// chance dada) — não é um cache de conversa, footprint mínimo em RAM.
const updateCounts = new Map();
const updateEmitter = new EventEmitter();

function ensureMemoryDir() {
    if (!fs.existsSync(MEMORY_DIR)) {
        fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }
}

function logFilePath(guildId) {
    return path.join(MEMORY_DIR, `${guildId}.json`);
}

// Lê o histórico completo direto do disco. Se o arquivo não existe ou está
// corrompido, retorna uma lista vazia (começa do zero) sem derrubar o bot.
function readLog(guildId) {
    const filePath = logFilePath(guildId);
    if (!fs.existsSync(filePath)) return [];

    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
        console.error("❌ Erro ao ler memória da IA, começando do zero:", err.message || err);
        return [];
    }
}

// Sobrescreve o arquivo em disco com o histórico completo passado.
function writeLog(guildId, log) {
    ensureMemoryDir();
    try {
        fs.writeFileSync(logFilePath(guildId), JSON.stringify(log, null, 2));
    } catch (err) {
        console.error("❌ Erro ao salvar memória da IA em disco:", err.message || err);
    }
}

/**
 * Lê o arquivo, adiciona uma entrada ao final e sobrescreve o arquivo —
 * tudo isso batendo no disco, sem depender de nada guardado em RAM. Também
 * conta essa atualização; a cada UPDATES_BEFORE_CHANCE, emite "activity" pra
 * dar ao Uriel a chance de comentar algo por conta própria.
 * @param {string} guildId
 * @param {{ role: "user"|"assistant", content: string }} entry
 */
function appendToLog(guildId, entry) {
    const log = readLog(guildId);
    log.push({ ...entry, timestamp: Date.now() });
    writeLog(guildId, log);

    const count = (updateCounts.get(guildId) || 0) + 1;
    if (count >= UPDATES_BEFORE_CHANCE) {
        updateCounts.set(guildId, 0);
        updateEmitter.emit("activity", guildId);
    } else {
        updateCounts.set(guildId, count);
    }
}

// Retorna as últimas N entradas (formato pronto pra mandar pro Ollama), lidas
// direto do disco. Nunca apaga nada do histórico completo salvo no arquivo.
function getRecentContext(guildId, limit = CONTEXT_WINDOW) {
    const log = readLog(guildId);
    return log.slice(-limit).map(({ role, content }) => ({ role, content }));
}

// Conta quantas entradas foram salvas nos últimos "windowMs" milissegundos.
// Usado pra decidir se o servidor está "ativo" o suficiente pra uma
// interação espontânea do Uriel (ver aiSpontaneous.js).
function getActivityCount(guildId, windowMs) {
    const log = readLog(guildId);
    const cutoff = Date.now() - windowMs;
    return log.filter(entry => entry.timestamp >= cutoff).length;
}

function clearGuildLog(guildId) {
    const filePath = logFilePath(guildId);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// 🧹 Apaga toda a pasta de memória. Chamada uma vez, ao iniciar o bot
// (ready.js) — assim cada sessão do bot começa com o Uriel "zerado".
function clearAllMemory() {
    if (!fs.existsSync(MEMORY_DIR)) return;

    fs.readdir(MEMORY_DIR, (err, files) => {
        if (err) return console.error("❌ Erro ao ler pasta de memória da IA:", err);

        for (const file of files) {
            if (file.endsWith(".json")) {
                const filePath = path.join(MEMORY_DIR, file);
                fs.unlink(filePath, (unlinkErr) => {
                    if (!unlinkErr) console.log(`🧹 Memória da IA limpa: ${file}`);
                });
            }
        }
    });
}

module.exports = {
    appendToLog,
    getRecentContext,
    getActivityCount,
    clearGuildLog,
    clearAllMemory,
    updateEmitter
};
