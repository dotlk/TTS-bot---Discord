# Uriel Bot — Discord Text-to-Speech

#### CS50x Final Project

**Author:** [dotlk](https://github.com/dotlk)  
**Project Repository:** [Uriel-bot](https://github.com/dotlk/Uriel-bot.git)  
**Video Demonstration:** Coming soon

For installation instructions, see [Installation and Setup](#3-installation-and-setup).
For instructions on running the application, see [Starting the Bot](#4-starting-the-bot).

**Description:**

Uriel Bot was developed as a final project for CS50x: Introduction to Computer Science.

The project brings together concepts learned throughout the course, including algorithms, data structures, asynchronous execution, software architecture, and integration between different programming languages.

Its central objective is to transform Discord text communication into configurable spoken interaction while supporting both traditional text-to-speech and neural voice cloning.



## 1. Project Overview

Uriel Bot is a Discord text-to-speech (TTS) application that converts text messages into spoken audio inside Discord voice channels. It supports multiple synthetic voices, AI-powered voice cloning, individual voice preferences, emotional speech presets, and configurable message-reading behavior.

The project was developed as a final project for Harvard University's CS50x: Introduction to Computer Science.

The main goal is to make text-based communication more accessible and interactive in Discord voice channels. Users can participate in voice conversations without using a microphone, while other participants hear their messages through synthesized speech.

Uriel Bot combines a Node.js application responsible for Discord interactions and audio playback with a Python service responsible for neural voice synthesis. A separate graphical launcher provides a convenient way to manage both processes on Windows.

## 2. Features

### Text-to-Speech

- Automatically converts messages from a configured text channel into speech.
- Plays generated audio in a Discord voice channel.
- Supports multiple languages and synthetic voices through Edge TTS.
- Allows individual users to select their preferred voices.
- Optionally announces the message author's username.
- Converts supported emojis and Discord mentions into readable text.
- Supports automatic message reading or prefix-based activation.

### AI Voice Cloning

Uriel Bot integrates Coqui XTTS v2, a multilingual neural text-to-speech model capable of synthesizing speech from reference audio.

Users can upload voice samples to create personalized voice profiles. These profiles can then be selected for message narration.

The system supports:

- Voice creation using MP3 or WAV reference audio.
- Multiple reference samples for the same voice.
- Persistent voice profiles organized by Discord server.
- Voice selection through Discord slash commands.
- Deletion and management of stored voice profiles.

Voice cloning is processed locally by the Python service. The first model initialization may require downloading model files.

Voice cloning should only be used with the speaker's permission.

### Emotional Speech

The XTTS2 service recognizes emotion tags embedded in text and applies different synthesis parameters.

Supported tags include:

| Emotion | Example tags |
|---|---|
| Happiness | `[feliz]`, `[alegre]` |
| Anger | `[raiva]`, `[bravo]`, `[irritado]` |
| Sadness | `[triste]` |
| Calmness | `[calmo]`, `[calma]` |
| Fear | `[medo]`, `[assustado]` |
| Surprise | `[surpreso]`, `[surpresa]` |
| Neutral | `[neutro]` |

For example:

`[feliz] I have great news! [triste] But something went wrong.`

These tags adjust parameters such as temperature, speaking speed, and repetition penalty. They do not guarantee a particular emotional performance.

Emotion presets are implemented in the XTTS2 service and are intended for cloned voices.

### Audio Queue Management

The audio queue is designed to handle multiple incoming messages without blocking the Discord event loop.

Speech generation starts asynchronously when a message enters the queue. Generated audio is then played through the Discord voice connection.

Instead of strictly waiting for messages in arrival order, the queue can prioritize audio that has already finished generating. This reduces unnecessary waiting when one synthesis request takes longer than another.

Separate queue and playback states are maintained for each Discord server.

Temporary audio files are removed after playback, and users can skip the current audio or disconnect the bot.

### Desktop Launcher

The project includes a Windows desktop launcher developed with Python and Tkinter.

The launcher provides:

- Independent startup controls for the Discord bot and XTTS2 service.
- Service status indicators.
- Separate log panels for the system, Discord, and XTTS2.
- Process monitoring and shutdown controls.
- A graphical interface for managing the application without manually opening multiple terminals.

The launcher source is located in `launchersrc/launcher.pyw`. A compiled Windows executable, `Uriel Bot.exe`, is also included in the repository.

The executable manages the services; it does not bundle all Node.js dependencies, Python packages, or XTTS2 model files.

## 3. Installation and Setup

### Prerequisites

Before installing Uriel Bot, make sure the following are available:

- Windows for the provided graphical launcher.
- Node.js and npm.
- A compatible Python installation.
- A Discord application and bot token.
- A Discord server where the bot can be installed.
- Internet access for Discord and Edge TTS.
- Sufficient memory and storage for XTTS2 if voice cloning is required.

A compatible NVIDIA GPU can accelerate XTTS2 inference. CPU inference may also be possible but can be considerably slower.

The Python dependencies include specific PyTorch versions and a CUDA package index. Compatibility depends on the operating system, Python version, and hardware configuration.

### Step 1 — Clone the Repository

Open a terminal and run:

```bash
git clone https://github.com/dotlk/Uriel-bot.git
cd Uriel-bot
```

Then proceed in the directory

### Step 2 — Install Node.js Dependencies

Install the required JavaScript packages:

```bash
npm install
```

This installs Discord.js, Discord voice libraries, Edge TTS, FFmpeg-related dependencies, and other packages declared in `package.json`.

### Step 3 — Configure Discord Credentials

Create a `.env` file in the project's root directory.

```dotenv
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_id
XTTS_SERVICE_URL=http://127.0.0.1:8000
```

Replace the placeholder values with your Discord application credentials.

*Optional*: You may also define GUILD_ID=your_discord_server_id to remove previously registered server-specific commands during deployment. New slash commands are registered globally, so this variable is not required.

Keep the .env file private. Never commit real bot tokens or credentials to a public repository.

In the Discord Developer Portal, configure the bot with the necessary permissions to view and read messages in the selected text channel, connect to voice channels, and speak. Enable the Message Content privileged intent for the bot.

### Step 4 — Register Slash Commands

Run:

```bash
npm run deploy
```

This registers the application's slash commands through the Discord API.

The current deployment script replaces the application's registered global commands, so avoid using it with an application that contains unrelated commands.

### Step 5 — Install the XTTS2 Service (Optional)

The XTTS2 service is only necessary for cloned-voice synthesis.

Navigate to the Python service directory:

```powershell
cd xtts-service
```

Create a virtual environment:

```powershell
python -m venv .venv
```

Activate it in PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install the Python dependencies:

```powershell
pip install -r requirements.txt
```

The first installation may take some time because PyTorch and the neural speech synthesis dependencies are relatively large.

The XTTS2 model is downloaded automatically when the service initializes if it is not already available locally.

Review and accept the applicable model license and terms before using it.

## 4. Starting the bot

### Step 1 — Start the Discord Bot

Open another terminal in the project's root directory:

```bash
node index.js
```

Alternatively, run:

```bash
npm start
```

Once connected, the bot becomes available in Discord.

### Step 2 — Start the XTTS2 Service

From the `xtts-service` directory, with the virtual environment activated, run:

```powershell
uvicorn server:app --host 127.0.0.1 --port 8000
```

Wait until the model has finished loading.

You can verify that the service is responding by visiting:

`http://127.0.0.1:8000/health`

A successful response includes the service status, inference device, and supported emotion tags.

### Recommended — Use the Windows Launcher (Optional)

On Windows, the provided `Uriel Bot.exe` can be used to manage both processes through a graphical interface.

Place the executable in the repository's root directory, as provided in the project structure.

The launcher offers separate controls for starting the Discord bot and XTTS2 service, monitoring their status, and stopping the processes.

The necessary dependencies and Python virtual environment must still be installed.

