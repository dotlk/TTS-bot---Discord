require("dotenv").config();
const { REST, Routes, SlashCommandBuilder, ChannelType } = require("discord.js");

const commands = [
    new SlashCommandBuilder()
        .setName("join")
        .setDescription("Conecta o bot ao seu canal de voz atual."),

    new SlashCommandBuilder()
        .setName("leave")
        .setDescription("Desconecta o bot do canal de voz."),

    new SlashCommandBuilder()
        .setName("skip")
        .setDescription("Pula a fala/áudio atual do bot imediatamente."),

    new SlashCommandBuilder()
        .setName("setchannel")
        .setDescription("Define o canal de texto onde o bot vai ler as mensagens para o TTS.")
        .addChannelOption(option =>
            option
                .setName("canal")
                .setDescription("O canal de texto que será monitorado")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("mode")
        .setDescription("Altera o modo de leitura (todas as mensagens ou apenas com prefixo).")
        .addStringOption(option =>
            option
                .setName("tipo")
                .setDescription("Escolha o modo de funcionamento")
                .setRequired(true)
                .addChoices(
                    { name: "Todas as Mensagens", value: "all" },
                    { name: "Apenas com Prefixo", value: "prefix" }
                )
        ),

    new SlashCommandBuilder()
        .setName("prefix")
        .setDescription("Define o símbolo de prefixo para ler mensagens (ex: ! ou .).")
        .addStringOption(option =>
            option
                .setName("simbolo")
                .setDescription("O caractere de prefixo")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("author")
        .setDescription("Ativa ou desativa a narração do nome do autor antes do texto.")
        .addBooleanOption(option =>
            option
                .setName("ativado")
                .setDescription("Marque como verdadeiro para falar o nome do autor")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("voice")
        .setDescription("Define a sua voz individual para o TTS.")
        .addStringOption(option =>
            option
                .setName("voz")
                .setDescription("Digite pra buscar entre as vozes do Edge e as vozes clonadas do servidor")
                .setRequired(true)
                .setAutocomplete(true)
        ),

    new SlashCommandBuilder()
        .setName("clonevoice")
        .setDescription("Clona uma voz a partir de um áudio de referência e a define como sua voz.")
        .addAttachmentOption(option =>
            option
                .setName("audio")
                .setDescription("Arquivo .mp3 ou .wav com 6 a 30 segundos de fala")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("nome")
                .setDescription("Um nome pra identificar essa voz (ex: 'Minha voz')")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("deletevoice")
        .setDescription("Apaga uma voz clonada (qualquer uma, de qualquer pessoa do servidor).")
        .addStringOption(option =>
            option
                .setName("voz")
                .setDescription("Digite pra buscar entre as vozes clonadas do servidor")
                .setRequired(true)
                .setAutocomplete(true)
        )
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log("🧹 Limpando comandos globais antigos...");
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [] }
        );

        if (process.env.GUILD_ID) {
            console.log("🧹 Limpando comandos antigos do servidor (Guild ID)...");
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: [] }
            );
        }

        console.log("🔄 Registrando novos comandos Slash no Discord...");
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );

        console.log("✅ Comandos Slash registrados e atualizados com sucesso!");
    } catch (error) {
        console.error("❌ Erro ao registrar comandos:", error);
    }
})();