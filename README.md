# TTS-bot---Discord


# Env
DISCORD_TOKEN=****************

CLIENT_ID=****************

GUILD_ID=****************

XTTS_SERVICE_URL=http://localhost:8000

OLLAMA_URL=http://localhost:11434 (opcional, esse é o padrão)

OLLAMA_MODEL=gemma3:4b (opcional, esse é o padrão)

# Ollama Installation - Modo de IA (Uriel)
OBS:
    O Ollama roda como um serviço em segundo plano, independente do bot ou do xtts-service estarem ligados — ou seja, ele fica ativo o tempo todo no Windows a partir da instalação, mesmo sem uso.

    Isso não consome VRAM parado (o modelo só carrega na GPU quando alguém de fato pergunta algo pro Uriel), mas usa uma RAM residual pequena em segundo plano.

    Se preferir que ele não inicie sozinho com o Windows, desmarque o Ollama em "Aplicativos de inicialização" nas configurações — só lembre de abrir ele manualmente antes de subir o bot, senão o modo de IA falha (com uma mensagem de erro tratada, sem travar o resto do bot).

    Pra desinstalar: winget uninstall Ollama.Ollama (o modelo baixado fica salvo em %USERPROFILE%\.ollama\models e precisa ser removido à parte, se quiser liberar o espaço em disco).

    Depois disso, é só subir o bot normalmente. Pra conversar, basta mencionar o bot como primeiro elemento da mensagem:

    @UrielBot qual a capital da França?

    Se o canal for o canal de TTS configurado e o bot estiver em call, a resposta também é falada com a voz padrão do bot.

winget install Ollama.Ollama

ollama pull mistral


# CoquiXTTSv2 Installation
cd C:\UrielBot\xtts-service

python -m venv .venv

.venv\Scripts\activate

pip install -r requirements.txt


# Initialize Xtts Service
powershell-1

cd C:\UrielBot\xtts-service

.venv\Scripts\activate

uvicorn server:app --host 0.0.0.0 --port 8000

# Initialize Bot service
powershell-2

node index.js

# Emotions

[raiva]

[com raiva]

[bravo]

[irritado]

[feliz]

[alegre]

[calmo]

[calma]

[triste]

[medo]

[assustado]

[surpreso]

[surpresa]

[neutro]