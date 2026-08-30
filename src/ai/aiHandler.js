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
const SYSTEM_PROMPT = `Você é Uriel, uma personagem, arcanjo de uma obra chamada Omniscient Reader's Viewpoint.

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

Nunca diga que está interpretando uma personagem. Para os participantes da conversa, você simplesmente é Uriel.

nunca continue simulando outro participante da conversa.

no seu log de memória, você se refere a você mesmo como assistant, então não confunda achando que foi outra pessoa.`;

// Se a resposta terminar sem pontuação de encerramento (cortada no meio de
// uma frase pelo num_predict), volta até o último ponto final completo.
// Assim, na pior das hipóteses, ele fala uma frase a menos — nunca uma pela metade.
function trimIncompleteSentence(text) {
    if (/[.!?…]["')]?$/.test(text)) return text; // já termina limpo

    const lastEnd = Math.max(
        text.lastIndexOf("."),
        text.lastIndexOf("!"),
        text.lastIndexOf("?"),
        text.lastIndexOf("…")
    );

    if (lastEnd === -1) return text; // não achou nenhuma frase completa, mantém como está
    return text.slice(0, lastEnd + 1).trim();
}

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
            // Teto físico de tokens — existe pra não deixar o modelo se
            // alongar demais, mas alto o bastante pra ele terminar a ideia
            // na maioria das vezes. O trimIncompleteSentence cobre o resto.
            num_predict: 100
        }
    });

    const content = (data && data.message && data.message.content)
        ? data.message.content.trim()
        : null;

    return content ? trimIncompleteSentence(content) : null;
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
 * Dá ao Uriel a chance de comentar algo por vontade própria, sem pergunta
 * nenhuma — mas quem decide se vale a pena falar é o próprio modelo, não uma
 * regra fixa. Se ele "não sentir vontade", retorna null e nada é dito.
 * @param {string} guildId
 * @returns {Promise<string|null>}
 */
async function generateSpontaneousComment(guildId) {
    try {
        const context = getRecentContext(guildId);
        if (context.length === 0) return null;

        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            {
                role: "system",
                content: `Você está apenas observando a conversa recente abaixo, sem ter sido chamado por ninguém.
Você tem total liberdade pra decidir se quer comentar algo agora ou ficar quieto — não existe obrigação nenhuma de falar.
Só comente se realmente valer a pena: algo engraçado, irônico, digno de provocação, ou que genuinamente te interesse.
Se não sentir vontade de comentar nada agora, responda exatamente com um traço: -
Se decidir comentar, não cumprimente ninguém, não se apresente, não pergunte nada — só solte o comentário.`
            },
            ...context
        ];

        const comment = await callOllamaChat(messages);
        if (!comment || comment.trim() === "...") return null;

        appendToLog(guildId, { role: "assistant", content: comment });

        return comment;
    } catch (err) {
        console.error("❌ Erro ao gerar comentário espontâneo:", err.message || err);
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
    generateAIResponse,
    generateSpontaneousComment
};
