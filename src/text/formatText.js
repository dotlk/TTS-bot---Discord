const gemojiModule = require("gemoji");
const unicodeToEmoji = gemojiModule ? gemojiModule.unicodeToEmoji : undefined;

const { getEmojiDictionary } = require("./emojiDictionary");

// 🔤 Converte qualquer emoji Unicode para o seu nome correspondente em PT-BR
function replaceUnicodeEmojisWithNames(text) {
    const customEmojiDictionary = getEmojiDictionary();

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

// 📝 Prepara o texto de uma mensagem do Discord para ser falado pelo TTS
function formatTextForTTS(message) {
    const customEmojiDictionary = getEmojiDictionary();

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

module.exports = {
    formatTextForTTS,
    replaceUnicodeEmojisWithNames
};
