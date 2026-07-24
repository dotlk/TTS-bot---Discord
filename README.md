# TTS-bot---Discord


# Env
DISCORD_TOKEN=****************

CLIENT_ID=****************

GUILD_ID=****************

XTTS_SERVICE_URL=http://localhost:8000


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