
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
const { registerVoice, getVoice, listVoices, deleteVoice, addVoiceSample, getReferencePaths, VOICES_DIR } = require("../voices/voiceRegistry");
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
                name: `🗣️ ${v.label} (cloned)`,
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

    if (interaction.commandName === "deletevoice" || interaction.commandName === "enrichvoice") {
        // Lista qualquer voz clonada no servidor (não só as do próprio usuário)
        const allChoices = listVoices(interaction.guild.id)
            .filter(v => v.label.toLowerCase().includes(focused))
            .map(v => ({
                name: interaction.commandName === "deletevoice" ? `🗑️ ${v.label}` : `🎙️ ${v.label}`,
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
                        content: "❌ You need to join a voice channel first.",
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

                    console.log("🔌 Connection status: READY");
                    await interaction.editReply(`✅ Joined **${voiceChannel.name}**!`);
                } catch (error) {
                    console.error("❌ Voice connection error:", error);
                    await interaction.editReply("❌ Failed to connect to the voice channel.");
                }

                break;
            }

            case "skip": {
                const player = getExistingPlayer(interaction.guild.id);
                const isPlaying = isGuildPlaying(interaction.guild.id);

                if (!player || !isPlaying) {
                    return interaction.reply({
                        content: "⚠️ There is no audio currently playing to skip.",
                        ephemeral: true
                    });
                }

                player.stop();
                await interaction.reply("⏭️ Audio skipped!");
                break;
            }

            case "voice": {
                await interaction.deferReply({ ephemeral: true });

                const raw = interaction.options.getString("voice");
                const separatorIndex = raw.indexOf(":");
                const type = raw.slice(0, separatorIndex);
                const value = raw.slice(separatorIndex + 1);

                if (type !== "edge" && type !== "clone") {
                    return interaction.editReply(
                        "❌ Invalid voice. Type to search and select one of the suggested options."
                    );
                }

                if (type === "clone" && !getVoice(value)) {
                    return interaction.editReply("❌ This cloned voice no longer exists. Please select another one.");
                }

                setUserVoice(interaction.guild.id, interaction.user.id, { type, value });

                const label = type === "clone"
                    ? getVoice(value).label
                    : (EDGE_VOICES.find(v => v.value === value)?.name || value);

                await interaction.editReply({
                    content: `✅ Your personal voice has been set to **${label}**!`
                });
                break;
            }

            case "setchannel": {
                await interaction.deferReply();

                const channel = interaction.options.getChannel("channel");

                updateGuildConfig(interaction.guild.id, { channelId: channel.id });
                updateGuildConfig(interaction.guild.id, { mode: "all" });

                await interaction.editReply(
                    `✅ TTS channel set to: ${channel}\n` +
                    `✅ TTS mode set to **All Messages**.`
                );
                break;
            }

            case "mode": {
                await interaction.deferReply();

                const mode = interaction.options.getString("type");
                const config = getGuildConfig(interaction.guild.id);

                // Se o usuário tentar colocar o modo "prefix", valida se ele já possui um prefixo cadastrado (Mensagem Privada)
                if (mode === "prefix" && !config.prefix) {
                    await interaction.deleteReply().catch(() => {});
                    return interaction.followUp({
                        content: "❌ You must set a prefix before switching to prefix mode!",
                        ephemeral: true
                    });
                }

                updateGuildConfig(interaction.guild.id, { mode: mode });

                // (Mensagem pública)
                await interaction.editReply(`✅ Mode changed to **${mode}**`);
                break;
            }

            case "prefix": {
                await interaction.deferReply();

                const prefix = interaction.options.getString("symbol");
                updateGuildConfig(interaction.guild.id, { prefix: prefix });

                await interaction.editReply(`✅ Prefix set to **${prefix}**`);
                break;
            }

            case "author": {
                await interaction.deferReply();

                const enabled = interaction.options.getBoolean("enabled");
                updateGuildConfig(interaction.guild.id, { announceAuthor: enabled });

                await interaction.editReply(`✅ Announce author: **${enabled ? "enabled" : "disabled"}**`);
                break;
            }

            case "clonevoice": {
                await interaction.deferReply({ ephemeral: true });

                const attachment = interaction.options.getAttachment("audio");
                const label = interaction.options.getString("name");

                const contentType = (attachment.contentType || "").split(";")[0].trim().toLowerCase();
                const extension = path.extname(attachment.name || "").toLowerCase();

                const isAudio = contentType.startsWith("audio/") || ALLOWED_AUDIO_EXTENSIONS.includes(extension);
                if (!isAudio) {
                    return interaction.editReply("❌ The file must be an audio file (.mp3 or .wav).");
                }

                if (attachment.size > MAX_AUDIO_SIZE) {
                    return interaction.editReply("❌ Audio file is too large. Upload a 6–30 second clip up to 15 MB.");
                }

                try {
                    const voiceId = randomUUID();
                    const ext = path.extname(attachment.name) || ".mp3";
                    const voiceDir = path.join(VOICES_DIR, interaction.guild.id, voiceId);
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
                        `✅ Voice **${label}** cloned and saved successfully!\n` +
                        `Use \`/voice\` to select it whenever you want.`
                    );
                } catch (error) {
                    console.error("❌ Voice cloning error:", error);
                    await interaction.editReply("❌ Failed to process the uploaded audio. Please try again.");
                }

                break;
            }

            case "deletevoice": {
                await interaction.deferReply({ ephemeral: true });

                const voiceId = interaction.options.getString("voice");
                const voiceMeta = getVoice(voiceId);

                if (!voiceMeta) {
                    return interaction.editReply("❌ This voice does not exist or has already been deleted.");
                }

                deleteVoice(voiceId);

                await interaction.editReply(`🗑️ Voice **${voiceMeta.label}** deleted successfully.`);
                break;
            }

            case "enrichvoice": {
                await interaction.deferReply({ ephemeral: true });

                const voiceId = interaction.options.getString("voice");
                const attachment = interaction.options.getAttachment("audio");

                const voiceMeta = getVoice(voiceId);
                if (!voiceMeta) {
                    return interaction.editReply("❌ This voice does not exist or has already been deleted. Select one of the suggested options.");
                }

                const contentType = (attachment.contentType || "").split(";")[0].trim().toLowerCase();
                const extension = path.extname(attachment.name || "").toLowerCase();

                const isAudio = contentType.startsWith("audio/") || ALLOWED_AUDIO_EXTENSIONS.includes(extension);
                if (!isAudio) {
                    return interaction.editReply("❌ The file must be an audio file (.mp3 or .wav).");
                }

                if (attachment.size > MAX_AUDIO_SIZE) {
                    return interaction.editReply("❌ Audio file is too large. Upload a 6–30 second clip up to 15 MB.");
                }

                try {
                    const voiceDir = path.dirname(getReferencePaths(voiceMeta)[0]);
                    const sampleNumber = getReferencePaths(voiceMeta).length + 1;
                    const ext = path.extname(attachment.name) || ".mp3";
                    const newSamplePath = path.join(voiceDir, `sample_${sampleNumber}${ext}`);

                    const response = await axios.get(attachment.url, { responseType: "arraybuffer" });
                    fs.writeFileSync(newSamplePath, response.data);

                    const totalSamples = addVoiceSample(voiceId, newSamplePath);

                    await interaction.editReply(
                        `✅ Voice **${voiceMeta.label}** enhanced! It now has **${totalSamples}** reference sample(s).`
                    );
                } catch (error) {
                    console.error("❌ Voice enhancement error:", error);
                    await interaction.editReply("❌ Failed to process the uploaded audio. Please try again.");
                }

                break;
            }

            case "leave": {
                const connection = getVoiceConnection(interaction.guild.id);

                if (!connection) {
                    return interaction.reply({
                        content: "❌ I am not connected to a voice channel.",
                        ephemeral: true
                    });
                }

                // 🧹 Limpa os arquivos de áudio não tocados da fila antes de sair
                await clearGuildQueue(interaction.guild.id);
                resetGuildState(interaction.guild.id);

                connection.destroy();
                await interaction.reply("👋 Left the voice channel!");
                break;
            }

            default:
                break;
        }
    });
};
