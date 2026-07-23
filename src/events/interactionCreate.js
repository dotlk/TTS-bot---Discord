const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { randomUUID } = require("crypto");

const { Events } = require("discord.js");

const {
    joinVoiceChannel,
    getVoiceConnection,
    entersState,
    VoiceConnectionStatus
} = require("@discordjs/voice");

const {
    getPlayer,
    getExistingPlayer,
    isGuildPlaying,
    clearGuildQueue,
    resetGuildState
} = require("../audio/queueManager");

const { getGuildConfig, updateGuildConfig, setUserVoice } = require("../../configManager");
const { registerVoice, getVoice, listVoices, deleteVoice, VOICES_DIR } = require("../voices/voiceRegistry");
const EDGE_VOICES = require("../tts/edgeVoices");

// Extensões aceitas como reserva, caso o Discord não informe o content-type corretamente
const ALLOWED_AUDIO_EXTENSIONS = [".mp3", ".wav"];
// Limite de tamanho do arquivo de referência (a voz é clonada com poucos segundos, não precisa de mais que isso)
const MAX_AUDIO_SIZE = 15 * 1024 * 1024; // 15 MB

// 🔎 Responde ao autocomplete do /voice (vozes clonadas + Edge) e do /deletevoice (só as vozes do próprio usuário)
async function handleAutocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();

    if (interaction.commandName === "voice") {
        const clonedChoices = listVoices(interaction.guild.id)
            .filter(v => v.label.toLowerCase().includes(focused))
            .map(v => ({
                name: `🗣️ ${v.label} (clonada)`,
                value: `clone:${v.voiceId}`
            }));

        const edgeChoices = EDGE_VOICES
            .filter(v => v.name.toLowerCase().includes(focused))
            .map(v => ({
                name: v.name,
                value: `edge:${v.value}`
            }));

        // Vozes clonadas aparecem primeiro na lista de sugestões
        const choices = [...clonedChoices, ...edgeChoices].slice(0, 25); // Discord só aceita até 25 opções
        return interaction.respond(choices).catch(() => {});
    }

    if (interaction.commandName === "deletevoice") {
        // Lista qualquer voz clonada no servidor (não só as do próprio usuário)
        const allChoices = listVoices(interaction.guild.id)
            .filter(v => v.label.toLowerCase().includes(focused))
            .map(v => ({
                name: `🗑️ ${v.label}`,
                value: v.voiceId
            }))
            .slice(0, 25);

        return interaction.respond(allChoices).catch(() => {});
    }
}

module.exports = function registerInteractionCreateEvent(client) {
    client.on(Events.InteractionCreate, async (interaction) => {
        if (interaction.isAutocomplete()) {
            return handleAutocomplete(interaction);
        }

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
                const player = getExistingPlayer(interaction.guild.id);
                const isPlaying = isGuildPlaying(interaction.guild.id);

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

                const raw = interaction.options.getString("voz");
                const separatorIndex = raw.indexOf(":");
                const type = raw.slice(0, separatorIndex);
                const value = raw.slice(separatorIndex + 1);

                if (type !== "edge" && type !== "clone") {
                    return interaction.editReply(
                        "❌ Voz inválida. Digite algo e escolha uma das opções sugeridas pelo Discord."
                    );
                }

                if (type === "clone" && !getVoice(value)) {
                    return interaction.editReply("❌ Essa voz clonada não existe mais. Escolha outra opção.");
                }

                setUserVoice(interaction.guild.id, interaction.user.id, { type, value });

                const label = type === "clone"
                    ? getVoice(value).label
                    : (EDGE_VOICES.find(v => v.value === value)?.name || value);

                await interaction.editReply({
                    content: `✅ Sua voz individual foi definida como **${label}**!`
                });
                break;
            }

            case "setchannel": {
                await interaction.deferReply();

                const channel = interaction.options.getChannel("canal");

                updateGuildConfig(interaction.guild.id, { channelId: channel.id });
                updateGuildConfig(interaction.guild.id, { mode: "all" });

                await interaction.editReply(
                    `✅ Canal configurado para TTS: ${channel}\n` +
                    `✅ Modo de TTS definido para **Todas as Mensagens**.`
                );
                break;
            }

            case "mode": {
                await interaction.deferReply();

                const mode = interaction.options.getString("tipo");
                const config = getGuildConfig(interaction.guild.id);

                // Se o usuário tentar colocar o modo "prefix", valida se ele já possui um prefixo cadastrado (Mensagem Privada)
                if (mode === "prefix" && !config.prefix) {
                    await interaction.deleteReply().catch(() => {});
                    return interaction.followUp({
                        content: "❌ Você precisa definir um prefixo primeiro antes de mudar para o modo prefixo!",
                        ephemeral: true
                    });
                }

                updateGuildConfig(interaction.guild.id, { mode: mode });

                // (Mensagem pública)
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

            case "clonevoice": {
                await interaction.deferReply({ ephemeral: true });

                const attachment = interaction.options.getAttachment("audio");
                const label = interaction.options.getString("nome");

                const contentType = (attachment.contentType || "").split(";")[0].trim().toLowerCase();
                const extension = path.extname(attachment.name || "").toLowerCase();

                const isAudio = contentType.startsWith("audio/") || ALLOWED_AUDIO_EXTENSIONS.includes(extension);
                if (!isAudio) {
                    return interaction.editReply("❌ O arquivo precisa ser um áudio (.mp3 ou .wav).");
                }

                if (attachment.size > MAX_AUDIO_SIZE) {
                    return interaction.editReply("❌ Áudio muito grande. Envie um trecho curto (6 a 30 segundos) de até 15MB.");
                }

                try {
                    const voiceId = randomUUID();
                    const ext = path.extname(attachment.name) || ".mp3";
                    const voiceDir = path.join(VOICES_DIR, voiceId);
                    fs.mkdirSync(voiceDir, { recursive: true });
                    const referencePath = path.join(voiceDir, `reference${ext}`);

                    // Baixa o áudio anexado no Discord e salva como referência da voz
                    const response = await axios.get(attachment.url, { responseType: "arraybuffer" });
                    fs.writeFileSync(referencePath, response.data);

                    registerVoice({
                        voiceId,
                        label,
                        ownerId: interaction.user.id,
                        guildId: interaction.guild.id,
                        referencePath
                    });

                    await interaction.editReply(
                        `✅ Voz **${label}** clonada e salva com sucesso!\n` +
                        `Use \`/voice\` pra selecioná-la quando quiser falar com ela.`
                    );
                } catch (error) {
                    console.error("❌ Erro ao clonar voz:", error);
                    await interaction.editReply("❌ Erro ao processar o áudio enviado. Tente novamente.");
                }

                break;
            }

            case "deletevoice": {
                await interaction.deferReply({ ephemeral: true });

                const voiceId = interaction.options.getString("voz");
                const voiceMeta = getVoice(voiceId);

                if (!voiceMeta) {
                    return interaction.editReply("❌ Essa voz não existe (ou já foi apagada).");
                }

                deleteVoice(voiceId);

                await interaction.editReply(`🗑️ Voz **${voiceMeta.label}** apagada com sucesso.`);
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
                resetGuildState(interaction.guild.id);

                connection.destroy();
                await interaction.reply("👋 Saí do canal de voz!");
                break;
            }

            default:
                break;
        }
    });
};