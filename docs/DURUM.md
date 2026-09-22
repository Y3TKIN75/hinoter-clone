# Proje Durumu — 19 Eylül 2026 (gerçek Groq ile doğrulandı)

HiNoter klonu (AI toplantı not alıcı, Groq API). Araştırma ve mimari: `docs/ARASTIRMA.md`. Kurulum/kullanım: `README.md`.

## Durum: v1 tamamlandı ✅

Stack: Vite + React 19 + TS (client) · Express 5 + TS via tsx (server) · `node:sqlite` · `groq-sdk` · Zod · Tailwind v4.
`npm run dev` (server :3001 + client :5173) · `npm run typecheck` · `npm run build && npm start`.

### Yapılanlar
- Sunucu: SQLite şeması + CRUD, Whisper parça transkripsiyonu (prompt zinciri, halüsinasyon filtresi, ofset), strict JSON şemalı özet + aksiyon (tek çağrı / map-reduce), export (md/txt/srt/json), açılışta model doğrulama ve yarım kalan işleri kurtarma.
- İstemci: mikrofon + sekme sesi karıştırma, 30 sn döndürmeli kayıt + arşiv, sıralı kuyruk, >25 MB dosya için tarayıcıda WAV parçalama; sayfalar (liste, kayıt, yükleme, detay: özet/aksiyonlar/transkript/dışa aktar), `useBlocker` ile kayıt sırasında geçiş koruması.
- Testler (scratchpad'de, repoya dâhil değil): sahte Groq sunucusuyla API uçtan uca (35 kontrol) ve headless Edge + sahte mikrofonla tarayıcı uçtan uca (25 kontrol) — hepsi geçiyor.
- İki inceleme turu (kendi incelemem + `/code-review high`) → 14 düzeltme uygulandı (elle eklenen aksiyonların korunması, TPM-güvenli çıktı sınırı, haftanın günü prompt'ta, iptal/çift-submit yarışları, vb.).

### Gerçek Groq ile doğrulandı (19 Eylül 2026)
- `.env` oluşturuldu; `modelsVerified: true`.
- Windows TTS (Microsoft Tolga) ile üretilen 75 sn'lik Türkçe toplantı sesi: dosya yükleme yolu → Whisper 2,3 sn / gpt-oss 2 sn; transkript neredeyse hatasız, 3 aksiyon sahip + tarihle doğru.
- Headless Edge'de sahte mikrofon olarak aynı WAV ile **canlı kayıt** yolu: 30 sn'lik gerçek WebM/Opus parçaları Groq tarafından kabul edildi, özet + aksiyonlar doğru.
- Bu testlerden çıkan iyileştirmeler: prompt'a haftanın günü + 14 günlük takvim (göreli tarihler artık doğru: "cumaya kadar", "yarın", "haftaya"), açık soru tanımı, sessizliğe duyarlı parça döndürme (30–40 sn), kuyruk halüsinasyon filtresi.
- Test notları `data/` altında duruyor (gitignore'da); uygulamayı açınca listede görünür.

### Kalan
- Git: repo başlatıldı ama **henüz commit yok**.
- Gerçek (insan) toplantı kaydıyla kalite kontrolü; gerekirse `GROQ_CHAT_MODEL=qwen/qwen3.8-27b` ile A/B.

## v2 fikirleri
"Ben / Diğerleri" iki akışlı konuşmacı etiketi · AI Chat (transkripte soru sor) · mind map (Mermaid) · tek tıkla çeviri · Notion/Slack push · Web Speech API ile anlık altyazı · toplantı botu · ffmpeg varsa sunucu tarafı parçalama.

## Notlar
- ffmpeg yok → >25 MB dosyalar tarayıcıda parçalanıyor (çok uzun dosyalarda bellek sınırı).
- Sekme sesi yalnızca Chrome/Edge masaüstü; Firefox/Safari yalnızca mikrofon.
- Free tier: LLM 8K TPM → `LLM_INPUT_BUDGET=5000` (map-reduce); Developer tier'da 100000 yapın.
- Groq'ta Llama modelleri Free/Dev tier'dan kaldırıldı (Ağustos 2026); `openai/gpt-oss-120b` kullanılıyor.
