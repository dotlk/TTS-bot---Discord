
require("dotenv").config();
const { REST, Routes, SlashCommandBuilder, ChannelType } = require("discord.js");

const commands = [
    new SlashCommandBuilder()
        .setName("join")
        .setDescription("Connects the bot to your current voice channel."),

    new SlashCommandBuilder()
        .setName("leave")
        .setDescription("Disconnects the bot from the voice channel."),

    new SlashCommandBuilder()
        .setName("skip")
        .setDescription("Immediately skips the current speech or audio playback."),

    new SlashCommandBuilder()
        .setName("setchannel")
        .setDescription("Sets the text channel the bot will monitor for TTS messages.")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("The text channel to monitor")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("mode")
        .setDescription("Changes the reading mode (all messages or prefix only).")
        .addStringOption(option =>
            option
                .setName("type")
                .setDescription("Choose the reading mode")
                .setRequired(true)
                .addChoices(
                    { name: "All Messages", value: "all" },
                    { name: "Prefix Only", value: "prefix" }
                )
        ),

    new SlashCommandBuilder()
        .setName("prefix")
        .setDescription("Sets the prefix character used to trigger TTS (e.g., ! or .).")
        .addStringOption(option =>
            option
                .setName("symbol")
                .setDescription("The prefix character")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("author")
        .setDescription("Enables or disables reading the author's name before their message.")
        .addBooleanOption(option =>
            option
                .setName("enabled")
                .setDescription("Whether to read the author's name aloud")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("voice")
        .setDescription("Sets your personal TTS voice.")
        .addStringOption(option =>
            option
                .setName("voice")
                .setDescription("Search Edge TTS voices and cloned voices available on the server")
                .setRequired(true)
                .setAutocomplete(true)
        ),

    new SlashCommandBuilder()
        .setName("clonevoice")
        .setDescription("Clones a voice from a reference audio file and sets it as your voice.")
        .addAttachmentOption(option =>
            option
                .setName("audio")
                .setDescription("An .mp3 or .wav file containing 6 to 30 seconds of speech")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("A name to identify this voice (e.g., 'My Voice')")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("deletevoice")
        .setDescription("Deletes a cloned voice from the server.")
        .addStringOption(option =>
            option
                .setName("voice")
                .setDescription("Search cloned voices available on the server")
                .setRequired(true)
                .setAutocomplete(true)
        ),

    new SlashCommandBuilder()
        .setName("enrichvoice")
        .setDescription("Adds another audio sample to an existing cloned voice to improve its quality.")
        .addStringOption(option =>
            option
                .setName("voice")
                .setDescription("Search cloned voices available on the server")
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addAttachmentOption(option =>
            option
                .setName("audio")
                .setDescription("Another .mp3 or .wav file with 6 to 30 seconds of speech from the same person")
                .setRequired(true)
        )
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log("🧹 Clearing old global commands...");
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [] }
        );

        if (process.env.GUILD_ID) {
            console.log("🧹 Clearing old server commands (Guild ID)...");
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: [] }
            );
        }

        console.log("🔄 Registering new slash commands on Discord...");
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );

        console.log("✅ Slash commands registered and updated successfully!");
    } catch (error) {
        console.error("❌ Error registering commands:", error);
    }
})();
