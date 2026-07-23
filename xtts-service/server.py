"""
Serviço HTTP mínimo que expõe o Coqui XTTS2 pro bot Node.js chamar.

Instalação:
    python3.11 -m venv .venv
    (ativa a venv)
    pip install -r requirements.txt

Rodar:
    uvicorn server:app --host 0.0.0.0 --port 8000

O bot Node aponta pra esse endereço via XTTS_SERVICE_URL no .env, ex:
    XTTS_SERVICE_URL=http://127.0.0.1:8000        (mesma máquina)
    XTTS_SERVICE_URL=http://192.168.0.10:8000      (outra máquina na rede local)
"""

import os
import tempfile

os.environ.setdefault("COQUI_TOS_AGREED", "1")  # aceita os termos do modelo automaticamente

import torch
from fastapi import FastAPI, Form, UploadFile, File
from fastapi.responses import Response
from TTS.api import TTS

app = FastAPI()

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"🔊 Carregando XTTS v2 no dispositivo: {device}... (isso demora alguns segundos)")
tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
print("✅ Modelo XTTS v2 carregado e pronto!")

# ⚠️ O XTTS v2 tem um limite de ~250 caracteres por chamada de síntese.
# Textos maiores que isso podem sair cortados ou dar erro — se isso virar
# problema no seu bot, o próximo passo é quebrar o texto em frases menores
# aqui ou no lado Node antes de mandar pra cá.
MAX_CHARS = 250


@app.post("/synthesize")
async def synthesize(
    text: str = Form(...),
    language: str = Form("pt"),
    reference_audio: UploadFile = File(...)
):
    text = text[:MAX_CHARS]

    # Salva o áudio de referência recebido do Node num arquivo temporário
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as ref_file:
        ref_file.write(await reference_audio.read())
        ref_path = ref_file.name

    output_path = ref_path.replace(".wav", "_out.wav")

    try:
        tts_model.tts_to_file(
            text=text,
            speaker_wav=ref_path,
            language=language,
            file_path=output_path
        )

        with open(output_path, "rb") as f:
            audio_bytes = f.read()

        return Response(content=audio_bytes, media_type="audio/wav")

    finally:
        # Limpa os arquivos temporários independente de deu certo ou não
        for p in (ref_path, output_path):
            if os.path.exists(p):
                os.remove(p)


@app.get("/health")
async def health():
    return {"status": "ok", "device": device}
