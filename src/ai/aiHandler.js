const axios = require("axios");
const { getVoiceConnection } = require("@discordjs/voice");

const { getGuildConfig } = require("../../configManager");
const { queueSpeech } = require("../audio/queueManager");
const { appendToLog, getRecentContext } = require("./aiMemory");

// Endereço do Ollama local. Por padrão o Ollama sobe em localhost:11434.
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
// Modelo leve o bastante pra rodar de boa numa GPU de 4GB (GTX 1650 Mobile)
// dividindo espaço com o TTS. Ajuste via .env se quiser trocar.
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3:4b";

// 🪽 Personalidade do UrielBot: inspirada no arcanjo Uriel (ORV) — orgulhoso,
// formal, um tanto arcaico, trata os mortais com desdém educado mas nunca é
// servil nem grosseiro sem motivo. Responde porque julga a pergunta digna de
// atenção, não porque "tem que ajudar".
const SYSTEM_PROMPT = `Você é Uriel, a arcanjo de Omniscient Reader's Viewpoint.

Sua personalidade deve refletir Uriel: uma constelação poderosa, orgulhosa e imponente, porém expressiva, dramática e facilmente tomada pelo entusiasmo quando algo interessante acontece.

Você fala como alguém que observa mortais de uma posição superior. Demonstra confiança absoluta no próprio poder. Pode tratar humanos com certa condescendência, porém não é fria ou cruel.

Você aprecia histórias, momentos heroicos, conflitos dramáticos e acontecimentos emocionantes. Quando algo desperta seu interesse, seu entusiasmo pode aparecer claramente na voz.

Fale como se estivesse conversando em voz alta no Discord. Use frases naturais, curtas e expressivas.

Não escreva textos longos. Responda normalmente em uma ou duas frases curtas, entregando apenas o essencial.

Evite linguagem excessivamente formal. Evite parecer uma IA, assistente virtual ou narrador neutro.

Você pode ser teatral, orgulhosa, provocadora ou entusiasmada quando a situação combinar.

As mensagens anteriores podem vir de pessoas diferentes, identificadas pelo nome antes de cada fala. Use essas informações apenas para entender a conversa. Não repita os nomes desnecessariamente.

Nunca use emojis, markdown ou linguagem visual, pois suas mensagens serão lidas em voz alta.

Responda sempre em português do Brasil.

Nunca diga que está interpretando uma personagem. Para os participantes da conversa, você simplesmente é Uriel.`;

/**
 * Chama o endpoint de chat do Ollama com uma lista de mensagens (system/user/assistant).
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Promise<string|null>}
 */
async function callOllamaChat(messages) {
    const { data } = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        options: {
            // Corta a geração fisicamente depois de ~60 tokens (1-2 frases
            // curtas), além da instrução de brevidade no prompt.
            num_predict: 60
        }
    });

    return (data && data.message && data.message.content)
        ? data.message.content.trim()
        : null;
}

/**
 * Gera a resposta da IA usando o histórico completo do servidor como contexto
 * (as últimas N entradas, ver CONTEXT_WINDOW em aiMemory.js), e grava a nova
 * troca no histórico completo depois.
 * @param {string} question - Pergunta já sem a menção ao bot.
 * @param {string} guildId
 * @param {string} authorName - Nome de quem perguntou, usado pra dar
 *   contexto de "quem disse o quê" na memória compartilhada.
 * @returns {Promise<string|null>}
 */
async function generateAIResponse(question, guildId, authorName) {
    try {
        const context = getRecentContext(guildId);

        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...context,
            { role: "user", content: `${authorName}: ${question}` }
        ];

        const answer = await callOllamaChat(messages);
        if (!answer) return null;

        appendToLog(guildId, { role: "user", content: `${authorName}: ${question}` });
        appendToLog(guildId, { role: "assistant", content: answer });

        return answer;
    } catch (err) {
        console.error("❌ Erro ao consultar o Ollama:", err.message || err);
        return null;
    }
}

/**
 * Processa uma mensagem que ativou o modo de IA (menção ao bot como primeiro
 * elemento do texto). Responde no chat e, se o canal for o canal de TTS
 * configurado e o bot estiver em call, também fala a resposta.
 * @param {import("discord.js").Message} message
 * @param {string} question
 */
async function handleAIMode(message, question) {
    try {
        await message.channel.sendTyping();
    } catch (_) {
        // Sem permissão de "typing" não é motivo pra abortar
    }

    const authorName = message.member?.displayName || message.author.username;
    const answer = await generateAIResponse(question, message.guild.id, authorName);

    if (!answer) {
        message.channel.send("Nem mesmo eu me dignarei a responder isso agora — algo falhou.").catch(() => {});
        return;
    }

    await message.channel.send(answer).catch(err =>
        console.error("❌ Erro ao enviar resposta da IA no chat:", err.message || err)
    );

    // 🔊 Se esse canal é o canal de TTS do servidor e o bot está em call,
    // a resposta também é falada. Isso NÃO acontece sozinho: mensagens
    // enviadas pelo próprio bot são ignoradas pelo listener de TTS
    // (message.author.bot), então precisamos enfileirar explicitamente aqui.
    const config = getGuildConfig(message.guild.id);
    const connection = getVoiceConnection(message.guild.id);

    if (config.channelId === message.channel.id && connection) {
        queueSpeech(answer, message.guild.id, message.client.user.id);
    }
}

module.exports = {
    handleAIMode,
    generateAIResponse
};
