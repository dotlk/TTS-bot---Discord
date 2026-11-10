
import os
import re
import tempfile
from typing import List

os.environ.setdefault("COQUI_TOS_AGREED", "1")

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

MAX_TOTAL_CHARS = 250
MAX_CHARS_PER_SEGMENT = 150

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"🔊 Carregando XTTS v2 no dispositivo: {device}...")

manager = ModelManager()
model_path, config_path, _ = manager.download_model(MODEL_NAME)

config = XttsConfig()
config.load_json(config_path)

tts_model = Xtts.init_from_config(config)
tts_model.load_checkpoint(config, checkpoint_dir=model_path, eval=True)
tts_model.to(device)

print("✅ XTTS v2 carregado e pronto!")

DEFAULT_PRESET = {
    "temperature": 0.75,
    "speed": 1.0,
    "repetition_penalty": 5.0
}

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


def split_text_into_chunks(text: str, max_chars: int):
    """Divide o texto em blocos, priorizando frases e palavras."""
    if max_chars <= 0:
        raise ValueError("max_chars precisa ser maior que zero.")

    chunks = []
    text = text.strip()

    while text:
        if len(text) <= max_chars:
            chunks.append(text)
            break

        window = text[:max_chars]

        sentence_ends = [
            match.end()
            for match in re.finditer(r"[.!?]+(?=\s|$)", window)
        ]

        if sentence_ends:
            cut = sentence_ends[-1]
        else:
            cut = window.rfind(" ")
            if cut <= 0:
                cut = max_chars

        chunk = text[:cut].strip()

        if chunk:
            chunks.append(chunk)

        text = text[cut:].strip()

    return chunks


def truncate_text_at_word(text: str, max_chars: int):
    """Limita o texto sem cortar palavras."""
    if max_chars <= 0:
        return ""

    if len(text) <= max_chars:
        return text

    candidate = text[:max_chars]

    if text[max_chars].isspace():
        return candidate.rstrip()

    last_space = candidate.rfind(" ")

    if last_space >= 0:
        return candidate[:last_space].rstrip()

    return ""


def parse_emotion_segments(raw_text: str):
    """Processa tags de emoção e limita o texto falado a 150 caracteres."""
    text = (raw_text or "").strip()

    if not text:
        return []

    segments = []
    remaining = MAX_TOTAL_CHARS
    current_emotion = None
    last_index = 0

    def add_chunk(chunk, emotion):
        nonlocal remaining

        if remaining <= 0:
            return

        chunk = " ".join(chunk.split())

        if not chunk:
            return

        if segments:
            if remaining <= 1:
                return
            remaining -= 1

        chunk = truncate_text_at_word(chunk, remaining)

        if not chunk:
            return

        for part in split_text_into_chunks(chunk, MAX_CHARS_PER_SEGMENT):
            segments.append((emotion, part))

        remaining -= len(chunk)

    for match in TAG_PATTERN.finditer(text):
        if remaining <= 0:
            break

        add_chunk(text[last_index:match.start()], current_emotion)

        if remaining <= 0:
            break

        label = match.group(1).strip().lower()

        if label in EMOTION_PRESETS:
            current_emotion = label
        else:
            add_chunk(match.group(0), current_emotion)

        last_index = match.end()

    if remaining > 0:
        add_chunk(text[last_index:], current_emotion)

    return segments


def synthesize_with_emotions(text: str, ref_paths: List[str], language: str):
    """Sintetiza os segmentos reutilizando a mesma condicionante de voz."""
    segments = parse_emotion_segments(text)

    if not segments:
        raise ValueError("Texto vazio após processamento das tags de emoção.")

    gpt_cond_latent, speaker_embedding = tts_model.get_conditioning_latents(
        audio_path=ref_paths
    )

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
        final_wav = await run_in_threadpool(
            synthesize_with_emotions,
            text,
            ref_paths,
            language
        )

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
    return {
        "status": "ok",
        "device": device,
        "emotions": list(EMOTION_PRESETS.keys())
    }
