# NotAsistan — AI Toplantı Not Alıcı (HiNoter klonu)

Toplantıyı **dinler**, konuşulanları **yazıya döker ve özetler**, **aksiyon maddelerini** (görev / sahip / tarih / öncelik / kaynak) otomatik çıkarır. Groq API üzerinde Whisper (STT) ve gpt-oss (LLM) kullanır.

## Özellikler

- **Kayıt**: mikrofon + (Chrome/Edge'de) toplantı sekmesinin sesi; Web Audio ile tek akışa karıştırılır. 30 sn'lik parçalar hâlinde **canlı transkript**.
- **Dosya yükleme**: MP3/WAV/M4A/MP4/WEBM/OGG/FLAC/MOV. ≤25 MB doğrudan; daha büyük dosyalar tarayıcıda 16 kHz mono WAV parçalarına bölünür (ffmpeg gerekmez).
- **Özet**: TL;DR, ana noktalar, kararlar, açık sorular, riskler, sonraki adımlar (strict JSON Schema + Zod doğrulama).
- **Aksiyonlar**: düzenlenebilir tablo — sahip, tarih, öncelik, "yapıldı", transkriptteki kaynağa atlama; elle ekleme.
- **Transkript**: zaman damgalı, aranabilir, tıkla → sese atla.
- **Dışa aktarma**: Markdown, TXT, SRT, JSON; Slack/e-posta için panoya kopyala.
- Türkçe (ve İngilizce / otomatik dil) transkript; Türkçe özet.

## Kurulum

Gereksinimler: **Node.js ≥ 22.13** (node:sqlite için; 24 önerilir), bir **Groq API anahtarı** ([console.groq.com/keys](https://console.groq.com/keys)).

```bash
npm install
cp .env.example .env      # GROQ_API_KEY değerini girin
npm run dev               # API :3001 + arayüz :5173
```

Tarayıcıda <http://localhost:5173> açın.

Üretim: `npm run build && npm start` → tek süreç, <http://localhost:3001>.

## Yapılandırma (`.env`)

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `GROQ_API_KEY` | — | Zorunlu |
| `GROQ_STT_MODEL` | `whisper-large-v3-turbo` | `whisper-large-v3` daha doğru, ~3× pahalı |
| `GROQ_CHAT_MODEL` | `openai/gpt-oss-120b` | Alternatif: `openai/gpt-oss-20b`, `qwen/qwen3.8-27b` (preview) |
| `LLM_INPUT_BUDGET` | `5000` | Tek LLM çağrısına gönderilecek transkript token bütçesi. **Free tier (8K TPM) için 5000**; Developer tier'da `100000` yapın → uzun toplantılar tek çağrıda özetlenir |
| `PORT` | `3001` | API portu |
| `DATA_DIR` | `./data` | SQLite + ses dosyaları |

> **Not (Eylül 2026):** Groq, Llama 3.x modellerini Free/Developer tier'dan kaldırdı. Eski rehberlerdeki `llama-3.3-70b-versatile` gibi ID'ler çalışmaz. Sunucu açılışta yapılandırılan modelleri `GET /models` ile doğrular ve uyarır.

## Tarayıcı desteği

| | Mikrofon | Sekme sesi (karşı taraf) |
|---|---|---|
| Chrome / Edge (masaüstü) | ✅ | ✅ Paylaşım penceresinde sekmeyi seçip **"Sekme sesini de paylaş"** kutusunu işaretleyin |
| Firefox / Safari | ✅ | ❌ (yalnızca mikrofon; hoparlörden gelen ses mikrofona düşerse yine yazıya dökülür) |
| Mobil tarayıcılar | ✅ | ❌ |

macOS'ta sekme dışı (uygulama/sistem) sesi için macOS 14.2+ ve Chrome 141+ gerekir.

## Mimari

```
client/  Vite + React 19 + TypeScript + Tailwind v4
  src/lib/capture.ts        mikrofon + getDisplayMedia sekme sesi → AudioContext karıştırma
  src/lib/chunkRecorder.ts  30 sn döndürmeli MediaRecorder (her parça bağımsız dosya) + arşiv kaydedici
  src/lib/transcribeQueue.ts sıralı yükleme, retry/backoff, sessiz parça atlama, Whisper prompt zinciri
  src/lib/audioFile.ts      >25 MB dosyalar için decode → 16 kHz mono WAV parçaları
server/  Express 5 + TypeScript (tsx) + node:sqlite + groq-sdk + Zod
  transcribe.ts   Whisper verbose_json, halüsinasyon filtresi, zaman ofsetleme
  summarize.ts    tek çağrı / map-reduce (LLM_INPUT_BUDGET), strict JSON Schema, arka plan iş
  prompts.ts      Türkçe sistem prompt'ları (özet + reduce)
  routes.ts       REST API
shared/types.ts  ortak tipler
docs/            araştırma (ARASTIRMA.md) ve durum (DURUM.md)
```

### API

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/api/health` | Anahtar/model durumu |
| GET/POST | `/api/notes` | Liste / oluştur |
| GET/PATCH/DELETE | `/api/notes/:id` | Detay (segments, summary, actionItems) / güncelle / sil |
| POST | `/api/transcribe` | multipart parça → segmentler (`noteId, idx, startMs, prevTail, lang, file`) |
| POST | `/api/notes/:id/upload` | ≤25 MB tam dosya → transkript + özet |
| POST/GET | `/api/notes/:id/audio` | Tam ses yükle / oynat (Range destekli) |
| POST | `/api/notes/:id/summarize` | Özet + aksiyon üret (arka planda; `GET /notes/:id` ile durum) |
| POST | `/api/notes/:id/action-items` | Elle aksiyon ekle |
| PATCH/DELETE | `/api/action-items/:id` | Aksiyon düzenle / sil |
| GET | `/api/notes/:id/export?format=md\|txt\|srt\|json` | Dışa aktar |

## Sınırlar ve bilinenler

- Groq **Free tier**: Whisper 25 MB/istek, 2 saat ses/saat; LLM 8K TPM → 1 saatlik toplantı map-reduce ile ~4–6 dk'da özetlenir. Developer tier (kart, abonelik yok) ile toplantı başına ≈ $0,05 ve saniyeler.
- Konuşmacı ayrımı (diarization) yok — Groq sunmuyor. Aksiyon sahipleri yalnızca isim söylendiyse çıkarılır.
- Whisper sessizlikte "Altyazı M.K." gibi halüsinasyonlar üretebilir; RMS kapısı + kara liste + `no_speech_prob` ile filtrelenir.
- 25 MB üstü dosyalar tarayıcı belleğinde çözülür; çok uzun (>2 saat) dosyalarda bellek sınırına takılabilir.
- Kayıt için katılımcılardan izin alın (KVKK). Ses Groq'a (ABD) gönderilir.

## Yol haritası (v2)

"Ben / Diğerleri" iki akışlı konuşmacı etiketi · AI Chat (transkripte soru sor) · mind map · tek tıkla çeviri · Notion/Slack push · Web Speech API ile anlık altyazı · toplantı botu.

## Lisans

MIT
