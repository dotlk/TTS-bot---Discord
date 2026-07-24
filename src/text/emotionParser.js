// ⚠️ NÃO ESTÁ EM USO ATUALMENTE.
// Foi escrito durante uma tentativa de migração pro IndexTTS2 (revertida por
// performance em GPU limitada). Fica guardado aqui pra reaproveitar um dia se quisermos
// trocarmos de motor de TTS por um que suporte emoção controlável.

const TAG_REGEX = /\[([^\[\]]{1,40})\]/g;

function parseEmotionSegments(rawText) {
    const text = (rawText || "").trim();
    if (!text) return [];

    const segments = [];
    let lastIndex = 0;
    let currentEmotion = null;
    let match;

    TAG_REGEX.lastIndex = 0;
    while ((match = TAG_REGEX.exec(text)) !== null) {
        const chunk = text.slice(lastIndex, match.index).trim();
        if (chunk) {
            segments.push({ emotion: currentEmotion, text: chunk });
        }
        currentEmotion = match[1].trim();
        lastIndex = TAG_REGEX.lastIndex;
    }

    const tail = text.slice(lastIndex).trim();
    if (tail) {
        segments.push({ emotion: currentEmotion, text: tail });
    }

    // Se não tinha nenhuma tag, o texto inteiro vira um único segmento neutro.
    if (segments.length === 0) {
        segments.push({ emotion: null, text });
    }

    return segments;
}

module.exports = { parseEmotionSegments };
