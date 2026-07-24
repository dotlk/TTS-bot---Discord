# TTS-bot---Discord


# Env
DISCORD_TOKEN=****************

CLIENT_ID=****************

GUILD_ID=****************

XTTS_SERVICE_URL==****************


# CoquiXTTSv2 Installation
cd C:\UrielBot\xtts-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt


# Initialize Xtts Service
powershell1
cd C:\UrielBot\indextts-service
.venv\Scripts\activate
uvicorn server:app --host 0.0.0.0 --port 8000

# Initialize Bot service
powershell2
node index.js