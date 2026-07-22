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

module.exports = function registerInteractionCreateEvent(client) {
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