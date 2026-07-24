"""
Serviço HTTP que expõe o Coqui XTTS2 pro bot Node.js chamar.

Suporta tags de emoção embutidas no texto, tipo:
    "[raiva] AAAA MALDITOO [calmo] Opa, me enganei.. hehe"

O XTTS2 não tem um controle de emoção de verdade (ele não aceita "fale triste"
como parâmetro) — o que existe são parâmetros de GERAÇÃO (temperature, speed,
repetition_penalty) que mudam o ritmo/energia da fala. Cada tag de emoção mapeia
pra um preset desses parâmetros. Isso NÃO é uma emoção discreta (não vai soar
"com nojo" de verdade), é mais uma variação de intensidade/ritmo.

IMPORTANTE: usamos a API de baixo nível (XttsConfig + Xtts), não o
TTS.api.TTS de alto nível. Isso é necessário porque o wrapper de alto nível
tem um bug conhecido que ignora os parâmetros de temperature/speed.

Instalação e execução: iguais a antes (pip install -r requirements.txt / uvicorn server:app)
"""

import os
import re
import tempfile
from typing import List

os.environ.setdefault("COQUI_TOS_AGREED", "1")  # aceita os termos do modelo automaticamente

import numpy as np
import torch
from fastapi import FastAPI, Form, UploadFile, File
from fastapi.responses import Response
from fastapi.concurrency import run_in_threadpool

from TTS.tts.configs.xtts_config import XttsConfig
from TTS.tts.models.xtts import Xtts
from TTS.utils.manage import ModelManager
from TTS.utils.audio.numpy_transforms import save_wav

app = FastAPI()

MODEL_NAME = "tts_models/multilingual/multi-dataset/xtts_v2"
SAMPLE_RATE = 24_000

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"🔊 Carregando XTTS v2 no dispositivo: {device}... (isso demora alguns segundos)")

# Garante que o modelo já foi baixado, e descobre o caminho local dele
manager = ModelManager()
model_path, config_path, _ = manager.download_model(MODEL_NAME)

config = XttsConfig()
config.load_json(config_path)

tts_model = Xtts.init_from_config(config)
tts_model.load_checkpoint(config, checkpoint_dir=model_path, eval=True)
tts_model.to(device)

print("✅ XTTS v2 carregado e pronto! (API de baixo nível — temperature/speed funcionando)")

# ⚠️ Limite de caracteres por TRECHO (não pela mensagem inteira)
MAX_CHARS_PER_SEGMENT = 250

# Preset padrão = os valores default do próprio XTTS2 (neutro)
DEFAULT_PRESET = {"temperature": 0.75, "speed": 1.0, "repetition_penalty": 5.0}

# Tags de emoção -> parâmetros de geração.
# temperature mais alta = mais variação/energia. speed = velocidade da fala.
EMOTION_PRESETS = {
    "raiva": {"temperature": 0.95, "speed": 1.15, "repetition_penalty": 3.0},
    "com raiva": {"temperature": 0.95, "speed": 1.15, "repetition_penalty": 3.0},
    "bravo": {"temperature": 0.95, "speed": 1.15, "repetition_penalty": 3.0},
    "irritado": {"temperature": 0.9, "speed": 1.1, "repetition_penalty": 3.5},
    "feliz": {"temperature": 0.85, "speed": 1.08, "repetition_penalty": 4.0},
    "alegre": {"temperature": 0.85, "speed": 1.08, "repetition_penalty": 4.0},
    "calmo": {"temperature": 0.6, "speed": 0.9, "repetition_penalty": 6.0},
    "calma": {"temperature": 0.6, "speed": 0.9, "repetition_penalty": 6.0},
    "triste": {"temperature": 0.65, "speed": 0.85, "repetition_penalty": 6.0},
    "medo": {"temperature": 0.9, "speed": 1.1, "repetition_penalty": 3.5},
    "assustado": {"temperature": 0.9, "speed": 1.12, "repetition_penalty": 3.0},
    "surpreso": {"temperature": 0.9, "speed": 1.05, "repetition_penalty": 4.0},
    "surpresa": {"temperature": 0.9, "speed": 1.05, "repetition_penalty": 4.0},
    "neutro": DEFAULT_PRESET,
}

TAG_PATTERN = re.compile(r"\[([^\[\]]{1,40})\]")


def parse_emotion_segments(raw_text: str):
    """Quebra o texto em (emocao, trecho) por tags [emocao]. Texto antes da 1ª tag é neutro."""
    text = (raw_text or "").strip()
    if not text:
        return []

    segments = []
    last_index = 0
    current_emotion = None

    for match in TAG_PATTERN.finditer(text):
        chunk = text[last_index:match.start()].strip()
        if chunk:
            segments.append((current_emotion, chunk[:MAX_CHARS_PER_SEGMENT]))
        current_emotion = match.group(1).strip().lower()
        last_index = match.end()

    tail = text[last_index:].strip()
    if tail:
        segments.append((current_emotion, tail[:MAX_CHARS_PER_SEGMENT]))

    if not segments:
        segments.append((None, text[:MAX_CHARS_PER_SEGMENT]))

    return segments


def synthesize_with_emotions(text: str, ref_paths: List[str], language: str):
    """Roda toda a síntese (bloqueante) — pensado pra ser chamado via run_in_threadpool."""
    segments = parse_emotion_segments(text)
    if not segments:
        raise ValueError("Texto vazio após remover as tags de emoção.")

    # Calcula a condicionante da voz UMA VEZ SÓ (reaproveitada em todos os trechos)
    gpt_cond_latent, speaker_embedding = tts_model.get_conditioning_latents(audio_path=ref_paths)

    all_wavs = []
    for emotion_label, segment_text in segments:
        preset = EMOTION_PRESETS.get(emotion_label, DEFAULT_PRESET)

        out = tts_model.inference(
            segment_text,
            language,
            gpt_cond_latent,
            speaker_embedding,
            temperature=preset["temperature"],
            speed=preset["speed"],
            repetition_penalty=preset["repetition_penalty"],
        )
        all_wavs.append(np.array(out["wav"]))

    return np.concatenate(all_wavs)


@app.post("/synthesize")
async def synthesize(
    text: str = Form(...),
    language: str = Form("pt"),
    reference_audio: List[UploadFile] = File(...)
):
    ref_paths = []
    for audio_file in reference_audio:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as ref_file:
            ref_file.write(await audio_file.read())
            ref_paths.append(ref_file.name)

    output_path = ref_paths[0].replace(".wav", "_out.wav")

    try:
        final_wav = await run_in_threadpool(synthesize_with_emotions, text, ref_paths, language)
        save_wav(wav=final_wav, path=output_path, sample_rate=SAMPLE_RATE)

        with open(output_path, "rb") as f:
            audio_bytes = f.read()

        return Response(content=audio_bytes, media_type="audio/wav")

    finally:
        for p in ref_paths + [output_path]:
            if os.path.exists(p):
                os.remove(p)


@app.get("/health")
async def health():
    return {"status": "ok", "device": device, "emotions": list(EMOTION_PRESETS.keys())}
