# HiNoter Klonu — Araştırma ve Mimari Dokümanı

Tarih: 18 Eylül 2026. Kaynaklar: HiNoter ürün sayfaları ve mağaza kayıtları, Groq resmi dokümanları (console.groq.com), MDN/caniuse/Chromium kaynak kodu, açık kaynak toplantı not alıcı projeler. "Doğrulanmış düzeltmeler" (tab/sistem sesi platform matrisi) uygulanmıştır.

---

## 1. HiNoter Nedir?

**HiNoter ("HiNoter – AI Note Taker")**, ses kaydını otomatik transkripte, yapılandırılmış özete ve aksiyon listesine dönüştüren bir **AI toplantı not alıcı** üründür. Kategori: Otter.ai / Fireflies / Fathom / Granola sınıfı.

**Kimlik ve köken**
- Web: `hinoter.com` (pazarlama; `/tr` altında Türkçe blog), `app.hinoter.com` (JS SPA web uygulaması).
- iOS satıcısı **AISION PTE. LTD.** (Singapur); telif satırı "© Recorder Pro"; ToS/gizlilik adresleri `recorder.cqyygtech.cn` (Chongqing Yeyuegua Technology Co., Ltd.); Android paketi `com.recordpro.audiorecord`. Yani jenerik bir **"Recorder Pro" ses kaydedicinin AI not alıcıya yeniden markalanmış hâli** (iOS yayın tarihi 4 Temmuz 2025). Türk menşeli değil; Türkçe 15 yerelden biri.

**Platformlar:** Web, iOS/iPadOS 14+, Apple Silicon Mac (iPad uygulaması olarak), Apple Watch (watchOS 6+), Android. Chrome eklentisi veya yerel Windows uygulaması **yok** (üçüncü taraf dizinlerdeki macOS/Windows iddiaları resmi sitede doğrulanmadı).

**Fiyatlandırma (hinoter.com/pricing):**
| Plan | Fiyat | Kapsam |
|---|---|---|
| Free | $0 | 1 not oluşturma, 1 notta AI özet + AI Chat/Search |
| Personal Pro | $6.99/hafta veya $69.99/yıl | Sınırsız kayıt/not, AI özet/aksiyon, sınırsız AI Chat, çok dilli transkript, takvim + workspace entegrasyonları |
| Team Pro | 2 koltuktan $119.98/yıl ($1.15/üye/hafta) | Paylaşımlı workspace, roller, merkezi fatura, takım aksiyon maddeleri |

iOS Türkiye mağazası: haftalık ₺299,99–329,99, yıllık ₺1.399–2.999,99, 3 yıllık ₺5.999,99, ömür boyu ₺19.999,99.

**Pazarlama iddiaları:** "1.000.000+ profesyonel", "50M+ dakika işlendi", App Store 4,7/5 (728 ABD oyu), Play ~500k+ indirme. Doğruluk iddiası sayfadan sayfaya değişiyor (~%93 / %95+ / %99+), dil sayısı da (50+ / 100+ / 120+); bağımsız ölçüm yok.

**Özellik envanteri (resmi sayfalardan):** tek dokunuşla mikrofon kaydı (arka planda çalışır), canlı transkript (iOS v4.7.0, Ağustos 2026), takvim tabanlı toplantı botu (Zoom / Google Meet / Teams), dosya yükleme (MP3/WAV/M4A/MP4/MOV/AVI), YouTube linki, PDF (OCR), konuşmacı ayrımı + konuşma süresi dağılımı, zaman damgalı transkript, AI özet (konular / kararlar / fikirler / sonraki adımlar / riskler / açık sorular), aksiyon tablosu (Görev / Sahip / Tarih / Kaynak), mind map, kaynak gösteren AI Chat (birden fazla notu kapsayabilir), tek tıkla çeviri, Workspace Templates, dışa aktarma (PDF/DOCX/SRT/TXT), Notion / Google Docs / Slack / e-posta / Salesforce / Zapier entegrasyonları, takım workspace'i. Jira/Trello/Asana yerel entegrasyonu yok (Zapier üzerinden).

---

## 2. Üç Ana Özellik Nasıl Çalışıyor?

> HiNoter kapalı kaynak. "Kullanıcı gözünden" kısımları resmi sayfalar ve sürüm notlarından; "teknik olarak" kısımları aynı kategorideki açık kaynak projelerin (Meetily, Anarlog, Vexa, meet-teams-bot, Amurex, Backchannel) yaptığından **çıkarımdır**.

### 2.1 Sesleri dinler

**Kullanıcı gözünden — dört yakalama yolu, hepsi aynı not hattına akar:**
1. **Mikrofon kaydı** (mobil + tarayıcı): tek dokunuş; arka planda çalışmaya devam eder. v4.7.0 (12 Ağu 2026) ile kayıt sırasında **canlı transkript**; v4.8.0 ile konuşmacı süre dağılımı ve canlı transkript yazı boyutu; v4.9.0 ile kayıt sırasında **canlı AI soru-cevap**.
2. **Toplantı botu ("HiNoter Assistant")**: Google/Outlook takvimini bağla → link içeren toplantılar listelenir → her toplantı için "katılsın" anahtarı (onaysız asla katılmaz) → saat gelince bot katılım ister → host Meet'te **Admit** basar / Teams lobisinden alır → katılımcı listesinde "HiNoter" görünür → görüşme bitince transkript + özet + aksiyonlar + mind map **e-posta** ile gelir. v4.7.0 ile toplantı linkini yapıştırarak botu ad hoc çağırma.
3. **Dosya yükleme / sürükle-bırak**: MP3, WAV, M4A, MP4, MOV, AVI.
4. **YouTube linki** ve **PDF** (OCR).

Motor iddiası: "Whisper Large V3", otomatik dil algılama (toplantı ortasında dil değişse bile), konuşmacı tanıma, zaman damgaları, çeviri. Canlı transkript kayıt sırasında akar; özet/aksiyon/mind map **kayıt bittikten sonra** üretilir (uzun kayıtlarda "%99'da takıldı" şikâyetleri var → kuyruklu asenkron işleme).

**Teknik olarak (çıkarım):**
- **Mobil/web kayıt:** cihaz mikrofonu → 20–60 sn'lik parçalar hâlinde sunucuya yükleme → Whisper-large-v3 ailesi ASR (kendi GPU'ları veya bir STT API'si) → parçalar zaman ofsetiyle birleştirilir → canlı transkript istemciye push edilir. Bu, Groq'un sunmadığı "streaming STT" olmadan "canlı" hissi vermenin standart yöntemidir.
- **Toplantı botu:** takvim API'leri (Google Calendar API / Microsoft Graph) ile link tespiti; toplantı saatinde bir konteyner içinde **headless tarayıcı** (Playwright/Puppeteer) Meet/Teams web istemcisine "HiNoter" adıyla katılır, sanal ses aygıtından sesi (ve videoyu) yakalar; Vexa ve Meeting BaaS `meet-teams-bot` tam olarak bunu açık kaynak yapıyor. Bu yol MVP için gereksiz derecede ağır (Docker, Redis, Postgres, MinIO).
- **Konuşmacı ayrımı:** Whisper diarization yapmaz; pyannote benzeri ayrı bir diarization adımı ("Speaker 1/2", kullanıcı yeniden adlandırır) ya da bot senaryosunda platform "aktif konuşmacı" meta verisi. Konuşma süresi dağılımı bu etiketlerin toplamıdır.
- **Dosya/YouTube/PDF:** ffmpeg ile 16 kHz mono'ya çevirip parçalara bölme; YouTube için yt-dlp benzeri indirici; PDF için OCR → aynı LLM hattı.

### 2.2 Konuşulanları özetler

**Kullanıcı gözünden — not detayı şu bölümlerden oluşur:**
- **Transcript**: zaman damgası + konuşmacı etiketi (`00:08:10 – Product Lead: …`), düzenlenebilir, anahtar kelime araması sesin o anına atlar.
- **AI Summary**: kısa genel bakış + yapılandırılmış bölümler: ana konular, kararlar, fikirler/çıkarımlar, sonraki adımlar, **riskler**, **açık sorular**, takip bağlamı; videolarda zaman damgalı **Key Moments**.
- **Mind Map** (otomatik konu grafiği), **konuşmacı süre grafiği**.
- **Workspace Templates** (Haz–Tem 2025): takım genelinde tutarlı not yapısı; Notion'daki mevcut veritabanı şablonuna uyabilir.
- Tek tıkla özet/transkript çevirisi; PDF/DOCX/SRT/TXT dışa aktarma; Notion'a otomatik sayfa (Date, Attendees, Tags, Status alanlarıyla), Google Docs, Slack'e hazır özet, e-posta; satış senaryosunda hazır takip e-postası taslağı.
- **AI Chat**: yanıtları transkriptlere dayandırır, zaman damgası alıntılar, birden çok toplantı üzerinde sorgu yapabilir.

**Teknik olarak (çıkarım):**
- Kayıt bitince tüm transkript (zaman damgalı segment listesi) tek bir **LLM çağrısına** (uzun bağlam pencereli model) sabit bir **JSON/Markdown şablonu** ile verilir; şablon bölümleri (summary, key_topics, decisions, next_steps, risks, open_questions) doğrudan UI sekmelerine eşlenir. Workspace Templates = farklı bölüm setleri/prompt varyantları.
- Çok uzun toplantılarda **map-reduce**: pencerelere böl → kısmi JSON → birleştir (Meetily 5.000 karakter/1.000 örtüşme; Amurex "mevcut listeyi gözden geçir ve ekle" prompt'u).
- Mind map = LLM'in ürettiği konu ağacı JSON'unun grafik olarak çizilmesi (klonda Mermaid `mindmap` ile bedava).
- AI Chat = transkript(ler) + soru → LLM; "kaynak gösterme" için segment zaman damgaları prompt'a gömülür ve modelden alıntılaması istenir (131K bağlamlı modellerde RAG'e gerek yok, sadece çoklu-not sorgularında embedding gerekir).
- Çeviri = aynı LLM'e "şu dile çevir" çağrısı.

### 2.3 Aksiyonları atar

**Kullanıcı gözünden:**
- AI, aksiyonları otomatik çıkarır ve tablo olarak gösterir: **Task / Owner / Due date / Source** (Source = transkriptteki ilgili ana zaman damgası linki) + risk/takip bağlamı. Örnek: "Update beta support docs — Priya — Friday afternoon".
- Sahipler konuşmadan çıkarılır ("Priya bunu cuma yapar" → owner: Priya). Team Pro'da workspace üyelerine bağlı **takım aksiyonları**.
- Site ısrarla **insan gözden geçirmesi** ister: "AI adayları üretir; onay, düzeltme ve takip sorumluluğu insanda".
- AI Chat'ten talep üzerine "aksiyonları çıkar", "takip mesajı taslağı yaz".
- Dağıtım: Notion, Slack, Google Docs, e-posta, Salesforce, Zapier (Jira/Trello/Asana için Zapier).

**Teknik olarak (çıkarım):**
- Aksiyon çıkarımı, özetle aynı LLM çağrısında **şema zorunlu** bir `action_items[]` alanıdır: `{task, owner|null, due_date|null, source_timestamp}`.
- **Owner eşleme**: prompt'a katılımcı listesi (takvim davetlileri / diarization etiketleri) verilir; model ismi listeye eşler, bulamazsa null bırakır. "Atama" = bu owner alanının workspace kullanıcısına bağlanması (Team Pro).
- **Tarih çözümleme**: "cuma", "gelecek hafta" gibi göreli ifadeler toplantı tarihine göre ISO tarihe çevrilir (prompt'ta `meeting_date` verilir).
- **Source**: model, aksiyonun geçtiği segmentin başlangıç saniyesini döndürür; UI bunu "sese atla" linkine çevirir.
- Kullanıcı tabloda düzenler/yeniden atar; sonuç `action_items` tablosunda saklanıp entegrasyonlara push edilir.

---

## 3. Groq API Yetenekleri

Tümü OpenAI uyumlu; base URL `https://api.groq.com/openai/v1`, header `Authorization: Bearer $GROQ_API_KEY`. SDK: `npm i groq-sdk` (1.6.0) / `pip install groq` (1.7.0, Python ≥3.10). OpenAI SDK'sı da `base_url` değiştirilerek çalışır (desteklenmeyenler: `logprobs`, `logit_bias`, `top_logprobs`, `messages[].name`, `n>1`; `temperature: 0` → 1e-8'e çevrilir).

### 3.1 KRİTİK: model listesi değişti — eski rehberlere güvenmeyin
- `llama-3.3-70b-versatile` ve `llama-3.1-8b-instant`: **17 Haziran 2026'da free/developer tier için deprecate edildi, 16 Ağustos 2026'da kapandı**; artık "Enterprise / Contact Sales". Çoğu eğitim/blog hâlâ bunları öneriyor — **kullanmayın**.
- Ayrıca kapatılanlar: `distil-whisper-large-v3-en` (2025-08-23 → `whisper-large-v3-turbo`), `deepseek-r1-distill-llama-70b`, `moonshotai/kimi-k2-instruct(-0905)`, `meta-llama/llama-4-scout/maverick`, `qwen/qwen3-32b`, `playai-tts`.

### 3.2 Konuşmadan metne (STT)
| Model ID | Fiyat | Hız | WER (İng.) | Not |
|---|---|---|---|---|
| `whisper-large-v3` | $0.111/saat | 189× gerçek zaman | %10,3 | Translation destekler |
| `whisper-large-v3-turbo` | $0.04/saat | 216× gerçek zaman | %12 | "30 sn'lik segmentler için optimize, min 10 sn"; translation yok |

- **Endpoint'ler:** `POST /openai/v1/audio/transcriptions`, `POST /openai/v1/audio/translations` (çıktı yalnızca İngilizce).
- **Girdi:** multipart `file` (flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm) **veya** `url` alanı. **Dosya limiti: Free 25 MB, Developer 100 MB.** Min. faturalama **10 sn/istek**. Groq kendisi 16 kHz mono'ya düşürür; büyük dosyalar için önerisi: `ffmpeg -i in -ar 16000 -ac 1 -map 0:a -c:a flac out.flac`.
- **Parametreler:** `model`, `language` (ISO-639-1; enum'da `"tr"` var; "doğruluk ve gecikmeyi iyileştirir"), `prompt` (**≤224 token**, ses diliyle aynı dilde; yalnızca son 224 token dikkate alınır), `response_format` = `json` (varsayılan) | `text` | `verbose_json` (**`srt`/`vtt` yok** — kendiniz üretin), `temperature` 0–1 (varsayılan 0), `timestamp_granularities[]` = `segment` (varsayılan, ek gecikme yok) ve/veya `word` (`verbose_json` gerekir, gecikme ekler).
- **`verbose_json` yanıtı:** `text`, `language`, `duration`, `segments[]{id, seek, start, end, text, tokens, temperature, avg_logprob, compression_ratio, no_speech_prob}`, `words[]{word, start, end}`. Groq dokümanı eşikler verir: `avg_logprob < -1` düşük güven, `compression_ratio > 2.4` şüpheli, yüksek `no_speech_prob` sessizlik (canlı yanıtta alanların geldiğini bir kez doğrulayın).
- **YOK:** konuşmacı ayrımı (diarization), streaming/WebSocket gerçek zamanlı STT. "Canlı" = istemcide parçalı kayıt + sık yükleme.

### 3.3 Sohbet / LLM
| Model ID | Durum | Bağlam / maks. çıktı | Fiyat (1M girdi/çıktı) | JSON Schema (strict) | Türkçe |
|---|---|---|---|---|---|
| `openai/gpt-oss-120b` | Production | 131.072 / 65.536 | $0.15 / $0.60 (cached girdi $0.075) | Evet | Zayıf bildirimler var → test edin |
| `openai/gpt-oss-20b` | Production | 131.072 / 65.536 | $0.075 / $0.30 | Evet | Aynı |
| `qwen/qwen3.8-27b` | **Preview** (kısa sürede kaldırılabilir) | 131.042 / 16.384 | $0.80 / $4.00 | Evet | Qwen3 119 dil (Türkçe dâhil) |
| `groq/compound`, `groq/compound-mini` | Production (ajan sistemi) | 131.072 / 8.192 | — | Hayır (yerleşik web arama/kod çalıştırma) | — |

- **Endpoint:** `POST /openai/v1/chat/completions` (ayrıca `/openai/v1/responses`, `GET /openai/v1/models`).
- **JSON modu:** `response_format: {type:"json_object"}` her modelde çalışır ama yalnızca "geçerli JSON" garantiler. **Structured Outputs:** `response_format: {type:"json_schema", json_schema:{name, strict:true, schema}}` → `gpt-oss-20b/120b`, `qwen3.8-27b`. Strict kuralları: her alan `required` içinde, `additionalProperties:false`, opsiyonel alan `["string","null"]`. **Structured Outputs ile streaming ve tool use desteklenmez.** Topluluk raporu: gpt-oss-120b bazen şemayı yok sayıyor → her zaman Zod doğrulama + 1 yeniden deneme.
- **Reasoning:** gpt-oss `reasoning_effort: low|medium|high` (varsayılan medium, minimum low); qwen `none|default|low|medium|high`; `reasoning_format: hidden|raw|parsed`.
- **Prompt caching:** gpt-oss-120b'de otomatik; cached girdi %50 indirimli ve **rate limit'e sayılmaz** (sabit sistem prompt'unu başa koyun).
- Tool calling OpenAI biçiminde (paralel çağrı yok).

### 3.4 Rate limit'ler (organizasyon bazında)
**Free tier**
| Model | RPM | RPD | TPM | TPD | Ses sn/saat | Ses sn/gün |
|---|---|---|---|---|---|---|
| gpt-oss-120b / 20b / qwen3.8-27b | 30 | 1.000 | **8.000** | 200.000 | – | – |
| groq/compound(-mini) | 30 | 250 | 70.000 | – | – | – |
| whisper-large-v3(-turbo) | 20 | 2.000 | – | – | **7.200** (2 saat ses/saat) | 28.800 (8 saat/gün) |

**Developer tier** (kart eklenir, kullandıkça öde, abonelik yok; $1/$10/$100/$500/$1.000 kümülatif eşiklerde fatura): gpt-oss-120b/20b 1.000 RPM / 500K RPD / **250K TPM**; whisper-large-v3 300 RPM, 200K ses-sn/saat; turbo 400 RPM, 400K ses-sn/saat, 4M/gün; dosya limiti 100 MB.

- Aşımda **429** + `retry-after` header'ı; `x-ratelimit-remaining-*` header'ları her yanıtta.
- **Tek istek TPM'i aşarsa 413** "Request too large … TPM: Limit 8000, Requested N". **Sonuç:** Free tier'da 1 saatlik Türkçe transkript (~15–25K token) tek çağrıda özetlenemez; ~5K tokenlık pencerelerle map-reduce yapılır ve TPM nedeniyle dakikada ~1 pencere işlenir (1 saatlik toplantı ≈ 4–6 dk). Developer tier'da tek çağrı, saniyeler.
- **Maliyet tahmini (Dev tier):** 1 saatlik toplantı ≈ Whisper turbo $0.04 + LLM (25K girdi × $0.15/1M + 2K çıktı × $0.60/1M) ≈ **$0.05**.

---

## 4. Klon için Önerilen Mimari

### 4.1 Stack (tek öneri)
**Next.js 15 (App Router, TypeScript) + Tailwind + Route Handlers (Node) + better-sqlite3 + Drizzle ORM + groq-sdk + zod**; ses dosyaları sunucu diskinde; opsiyonel sistem `ffmpeg` (>25 MB yüklemeler için).

Gerekçe: tek süreç / tek `npm run dev`; Groq anahtarı yalnızca sunucuda (`process.env.GROQ_API_KEY`); dosya yükleme Route Handler'da `req.formData()` ile doğrudan çalışır (25 MB için gövde limiti sorunu yok); HiNoter'ın ekranları (liste → kayıt → not detayı sekmeleri) sayfalara 1:1 eşlenir; MeetingMind ve Vishu klonları aynı kalıbı kullanıyor. SQLite tek dosya, yedeklemesi kolay; Windows'ta better-sqlite3 prebuilt binary ile derleme gerektirmez (sorun olursa `@libsql/client` aynı Drizzle şemasıyla çalışır).

Alternatifler:
- **Vite + React + Hono (Node)** — iki süreç ama daha hızlı HMR; API'yi ileride mobil uygulamaya açacaksanız.
- **Tauri (Rust) masaüstü, Meetily kalıbı** — sistem sesi her OS'te tarayıcı kısıtı olmadan; ama Rust + native ses katmanı MVP için 3–4× iş.

### 4.2 Ses yakalama (tarayıcı)
Platform matrisi (`getDisplayMedia` ses, Chromium 141+): **sekme sesi** = Windows, macOS, Linux, ChromeOS (her zaman); **ekran/sistem sesi** = Windows, ChromeOS, macOS 14.2+ (opt-in kutucuk; Linux yalnızca flag arkasında). **Firefox ve Safari `audio:true`'yu sessizce yok sayar** (0 ses track'i, hata yok); **hiçbir mobil tarayıcı** desteklemez. Tasarım kararı: Chrome/Edge = "sekme sesi + mikrofon" yolu; diğerleri = yalnızca mikrofon (hoparlör sesi mikrofona akustik olarak düşer) veya dosya yükleme.

```ts
// hooks/useRecorder.ts — yakalama + karıştırma (kullanıcı tıklamasından çağrılmalı)
export async function startCapture(opts: { tabAudio: boolean }) {
  const mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  let display: MediaStream | null = null;
  if (opts.tabAudio) {
    display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 },          // video:true zorunlu; track'i durdurma, sadece kullanma
      audio: true,
      // @ts-expect-error Chromium ipuçları
      selfBrowserSurface: "exclude", systemAudio: "include", surfaceSwitching: "include",
    });
    if (display.getAudioTracks().length === 0) {   // kutucuk işaretlenmedi ya da Firefox/Safari
      display.getTracks().forEach(t => t.stop()); display = null;
      notify("Sekme sesi alınamadı; yalnızca mikrofon kaydediliyor.");
    }
  }
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  const micGain = ctx.createGain(); micGain.gain.value = 1.0;
  ctx.createMediaStreamSource(mic).connect(micGain).connect(dest);
  if (display) {
    const tabGain = ctx.createGain(); tabGain.gain.value = 0.8;
    ctx.createMediaStreamSource(display).connect(tabGain).connect(dest); // ASLA ctx.destination'a bağlama → yankı
    display.getVideoTracks()[0].addEventListener("ended", stopAll);      // "Paylaşımı durdur"
  }
  const analyser = ctx.createAnalyser();                                  // RMS / sessizlik tespiti
  ctx.createMediaStreamSource(dest.stream).connect(analyser);
  const mixed = new MediaStream(dest.stream.getAudioTracks());            // yalnızca ses
  return { mixed, analyser, stopAll: () => [mic, display].forEach(s => s?.getTracks().forEach(t => t.stop())) };
}

export const MIME = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
  .find(m => MediaRecorder.isTypeSupported(m))!;                          // Safari 18.4+ webm/opus kaydeder; eski Safari mp4
export const EXT = MIME.startsWith("audio/webm") ? "webm" : MIME.startsWith("audio/mp4") ? "m4a" : "ogg";
```

### 4.3 Parçalama (chunking) stratejisi
`MediaRecorder.start(timeslice)` **kullanmayın**: yalnızca ilk blob container başlığı taşır, sonrakiler tek başına çözülemez. Bunun yerine **her 30 sn'de kaydediciyi döndürün** (yenisini başlat → eskisini durdur; böylece boşluk yerine birkaç ms örtüşme olur) ve paralel bir **arşiv kaydedici** ile tam dosyayı tutun.

```ts
const CHUNK_MS = 30_000;                       // Whisper'ın doğal penceresi; min faturalama 10 sn
let current: MediaRecorder, idx = 0; const t0 = performance.now();
let chunkMaxRms = 0;

function makeRecorder() {
  const rec = new MediaRecorder(mixed, { mimeType: MIME, audioBitsPerSecond: 32_000 }); // ~0,24 MB/dk
  const startMs = Math.round(performance.now() - t0), myIdx = idx++;
  rec.ondataavailable = e => {
    if (e.data.size === 0) return;             // iOS Safari boş blob gönderebilir
    const silent = chunkMaxRms < 0.01;         // ≈ -40 dBFS altı → sessiz, Whisper'a gönderme (halüsinasyon)
    chunkMaxRms = 0;
    uploadQueue.push({ idx: myIdx, startMs, blob: e.data, silent });
  };
  return rec;
}
function rotate() { const next = makeRecorder(); next.start(); current.stop(); current = next; }
current = makeRecorder(); current.start(); const timer = setInterval(rotate, CHUNK_MS);

// Arşiv (oynatma/atlama için tek dosya)
const archive = new MediaRecorder(mixed, { mimeType: MIME }); const parts: Blob[] = [];
archive.ondataavailable = e => e.data.size && parts.push(e.data); archive.start(1000);
// stop: new Blob(parts, {type: MIME}) → fix-webm-duration ile süre başlığını yaz → POST /api/notes/:id/audio
```

RMS: her ~100 ms `analyser.getFloatTimeDomainData(buf)` → `sqrt(mean(x²))`, chunk boyunca maksimumu tut.

**Yükleme kuyruğu:** eşzamanlılık 1 (bir sonraki chunk'ın `prompt`'u öncekinin metin kuyruğuna bağlı), sırada işleme, başarısızda geri koyup 3 kez dene. Free tier 20 RPM'e karşılık 30 sn chunk = 2 RPM.

**Dosya yükleme yolu:** ≤25 MB → doğrudan Groq. >25 MB → sunucuda `ffmpeg -i in -ar 16000 -ac 1 -map 0:a -c:a flac out.flac`; hâlâ büyükse 600 sn'lik parçalar + 10 sn örtüşme (`-ss/-t`), her parça `verbose_json`, segmentler ofsetlenir, örtüşme zaman damgasıyla ayıklanır (Groq cookbook `audio-chunking`). ffmpeg Windows'ta `scoop install ffmpeg`.

### 4.4 Transkripsiyon akışı (sunucu)
```ts
// app/api/transcribe/route.ts
import Groq, { toFile } from "groq-sdk";
export const runtime = "nodejs";
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 5 }); // 429'da retry-after'a uyar

const HALLUCINATIONS = [/altyazı\s*m\.?k\.?/i, /izlediğiniz için teşekkür/i, /abone olmayı unutmayın/i,
  /kanalıma abone/i, /thank you for watching/i, /subtitles by/i];

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file") as File;
  const noteId = String(form.get("noteId")), idx = Number(form.get("idx")), startMs = Number(form.get("startMs"));
  const prevTail = String(form.get("prevTail") ?? ""), lang = String(form.get("lang") || "tr");
  if (file.size > 25 * 1024 * 1024) return Response.json({ error: "Dosya 25 MB sınırını aşıyor" }, { status: 413 });

  const buf = Buffer.from(await file.arrayBuffer());
  await saveChunkFile(noteId, idx, file.name, buf);                    // data/audio/<noteId>/<idx>.webm
  const note = await getNote(noteId);
  const glossary = `Toplantı: ${note.title}. Katılımcılar: ${note.participants.join(", ")}.`;

  const r: any = await groq.audio.transcriptions.create({
    file: await toFile(buf, file.name),                                // uzantı container ile eşleşmeli
    model: "whisper-large-v3-turbo",
    language: lang === "auto" ? undefined : lang,                      // "tr" → doğruluk + dil kaymasını önler
    prompt: `${glossary} ${prevTail}`.slice(-650),                     // ≤224 token; yalnızca son 224 token sayılır
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
    temperature: 0,
  });

  const segments = (r.segments ?? [])
    .filter((s: any) => !(s.no_speech_prob > 0.6) && !HALLUCINATIONS.some(rx => rx.test(s.text)))
    .map((s: any) => ({ start: startMs / 1000 + s.start, end: startMs / 1000 + s.end, text: s.text.trim() }));
  await saveSegments(noteId, idx, segments, r);
  const text = segments.map((s: any) => s.text).join(" ");
  return Response.json({ idx, segments, tail: text.slice(-450) });    // istemci bir sonraki chunk'a prevTail olarak verir
}
```
Sessiz işaretli chunk'lar sunucuya "boş" olarak kaydedilir (Groq'a gitmez) ve `prevTail` sıfırlanır (halüsinasyon zincirlenmesin). Canlı UI: her chunk için "yazıya dökülüyor…" yer tutucu, dönünce zaman damgalı blok; gecikme ~30–35 sn.

### 4.5 Özet + aksiyon: prompt ve JSON şeması
Model: varsayılan `openai/gpt-oss-120b` (`reasoning_effort:"low"`, `temperature:0.2`, strict şema). Env ile `qwen/qwen3.8-27b`'ye geçilebilir; ilk gün 3 gerçek Türkçe toplantıyla ikisini karşılaştırın (Bölüm 6).

**Sistem prompt'u (`lib/prompts.ts`):**
```
Sen deneyimli bir toplantı asistanısın. Sana zaman damgalı satırlardan oluşan bir toplantı transkripti verilecek.
Kurallar:
1. YALNIZCA transkriptte açıkça geçen bilgileri kullan. İsim, tarih, görev veya karar UYDURMA.
2. "Karar" = grubun açıkça üzerinde anlaştığı veya taahhüt ettiği şey. Sadece dile getirilen bir öneri/fikir karar DEĞİLDİR.
3. Aksiyonun "owner" alanını yalnızca o görevden sorumlu kişi açıkça adlandırıldıysa doldur; aksi hâlde null.
   İsimleri katılımcı listesine eşle ({participants}); listede yoksa transkriptteki hâliyle yaz.
4. "due_date" yalnızca bir tarih/gün/zaman aralığı açıkça söylendiyse. Göreli ifadeleri ("yarın", "cuma", "gelecek hafta")
   toplantı tarihi {meeting_date} esas alınarak ISO 8601 (YYYY-MM-DD) biçimine çevir; çevrilemiyorsa null.
5. "priority": transkriptteki aciliyet dilinden ("acil", "hemen", "bugün", "gün sonuna kadar" → high). Sinyal yoksa "medium".
6. "source_timestamp": aksiyonun söylendiği satırın başlangıç saniyesi (satır başındaki [ss:dd:sn]); "source_quote": o satırdan ≤25 kelimelik alıntı.
7. Zamirleri isimlere çöz. İsim ve kısaltmaları transkriptteki gibi koru; STT kaynaklı bariz yazım hatalarını düzeltebilirsin.
8. Bir bölüm için içerik yoksa boş liste döndür; doldurmak için madde uydurma.
9. Tüm metin değerlerini Türkçe yaz; JSON anahtarlarını İngilizce bırak. "tldr" 2–4 cümle, "title" ≤ 8 kelime.
10. Yalnızca JSON döndür; açıklama veya kod bloğu ekleme.
```
**Kullanıcı mesajı:** `Toplantı tarihi: 2026-09-18\nKatılımcılar: Yetkin, Ayşe, Mehmet\n\nTRANSKRİPT:\n[00:00:08] …\n[00:00:31] …`

**Groq strict JSON şeması (`lib/schema.ts`, elle yazılır; Zod yalnızca doğrulama için):**
```json
{
  "type": "object", "additionalProperties": false,
  "required": ["title","tldr","key_points","decisions","action_items","open_questions","risks","next_steps"],
  "properties": {
    "title": { "type": "string" },
    "tldr": { "type": "string" },
    "key_points": { "type": "array", "items": { "type": "string" } },
    "decisions": { "type": "array", "items": { "type": "string" } },
    "action_items": { "type": "array", "items": {
      "type": "object", "additionalProperties": false,
      "required": ["task","owner","due_date","priority","source_timestamp","source_quote"],
      "properties": {
        "task": { "type": "string" },
        "owner": { "type": ["string","null"] },
        "due_date": { "type": ["string","null"] },
        "priority": { "type": "string", "enum": ["high","medium","low"] },
        "source_timestamp": { "type": ["number","null"] },
        "source_quote": { "type": ["string","null"] }
      } } },
    "open_questions": { "type": "array", "items": { "type": "string" } },
    "risks": { "type": "array", "items": { "type": "string" } },
    "next_steps": { "type": "array", "items": { "type": "string" } }
  }
}
```

**Çağrı + uzunluk stratejisi (`lib/summarize.ts`):**
```ts
const BUDGET = Number(process.env.LLM_INPUT_BUDGET ?? 5000);   // Free: 8K TPM → ~5K girdi; Dev tier: 100000
export async function summarize(note, segments) {
  const lines = segments.map(s => `[${hms(s.start)}] ${s.text}`);
  const est = Math.ceil(lines.join("\n").length * 0.4);          // Türkçe için kaba token tahmini
  if (est <= BUDGET) return callLLM(userMsg(note, lines.join("\n")));
  // map-reduce: segment sınırlarında ~BUDGET tokenlık pencereler, %10 örtüşme, ileri taşınan 1 satırlık özet
  const partials = []; let running = "";
  for (const win of windows(lines, BUDGET, 0.1)) {
    const p = await callLLM(userMsg(note, win, `Önceki bölümlerin özeti: ${running}`));
    partials.push(p); running = p.tldr;
  }
  return callLLM(reduceMsg(note, partials));   // "Aynı toplantının ardışık bölümlerinden N kısmi not; tek nihai nota birleştir,
                                               //  aynı görevi farklı ifade eden aksiyonları tekilleştir, çelişkide sonraki bölümü esas al"
}
async function callLLM(user: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await groq.chat.completions.create({
      model: process.env.GROQ_CHAT_MODEL ?? "openai/gpt-oss-120b",
      temperature: 0.2, reasoning_effort: "low", max_completion_tokens: 4000,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
      response_format: { type: "json_schema", json_schema: { name: "meeting_notes", strict: true, schema: MEETING_NOTES_SCHEMA } },
    });
    const parsed = MeetingNotesZod.safeParse(JSON.parse(stripFences(r.choices[0].message.content ?? "")));
    if (parsed.success) return parsed.data;
  }
  throw new Error("LLM geçerli JSON üretmedi");
}
```
Sonuç `summaries.json`'a ham olarak, `action_items` satır satır düzenlenebilir tabloya yazılır. UI'da her aksiyon: görev, sahip (katılımcı listesinden seçim + serbest metin), tarih seçici, öncelik, "yapıldı" kutusu, **"Kaynağa git"** (audio.currentTime = source_timestamp, segment vurgulanır). Bu "atama" işlevinin klon karşılığıdır.

### 4.6 Kalıcılık (SQLite, Drizzle)
```sql
notes        (id TEXT PK, title, created_at INT, meeting_date TEXT, lang TEXT, participants TEXT/*JSON*/,
              source TEXT /*mic|tab_mic|upload*/, status TEXT /*recording|transcribing|summarizing|ready|error*/,
              duration_ms INT, audio_path TEXT)
chunks       (id INT PK, note_id, idx INT, start_ms INT, file_path TEXT, silent INT, status TEXT /*pending|done|failed*/, raw_json TEXT)
segments     (id INT PK, note_id, chunk_idx INT, start_s REAL, end_s REAL, text TEXT, speaker TEXT NULL)
summaries    (id INT PK, note_id, model TEXT, json TEXT, created_at INT)
action_items (id TEXT PK, note_id, task TEXT, owner TEXT NULL, due_date TEXT NULL, priority TEXT,
              source_timestamp REAL NULL, source_quote TEXT NULL, done INT DEFAULT 0, position INT)
```
Ses dosyaları `data/audio/<noteId>/` altında (chunk'lar + `full.webm`); `data/app.db` WAL modunda. Tarayıcı tarafında yalnızca `localStorage` (son dil, sekme sesi tercihi). SRT/TXT/Markdown dışa aktarma `segments` + `summaries`'den üretilir (Groq SRT vermez).

### 4.7 Klasör yapısı
```
hinoter-clone/
├─ app/
│  ├─ layout.tsx, page.tsx                 # Not listesi + "Yeni kayıt / Dosya yükle"
│  ├─ record/page.tsx                      # Başlık, katılımcılar, dil, "sekme sesi" anahtarı; canlı transkript
│  ├─ notes/[id]/page.tsx                  # Sekmeler: Transkript | Özet | Aksiyonlar | Dışa aktar
│  └─ api/
│     ├─ notes/route.ts                    # POST oluştur, GET liste
│     ├─ notes/[id]/route.ts               # GET detay, PATCH başlık/katılımcı, DELETE
│     ├─ notes/[id]/audio/route.ts         # POST tam dosya, GET oynatma (Range destekli)
│     ├─ notes/[id]/finalize/route.ts      # kaydı kapat → summarize kuyruğu
│     ├─ transcribe/route.ts               # chunk → Groq Whisper
│     ├─ upload/route.ts                   # dosya yükleme → (ffmpeg) → parçala → transcribe
│     ├─ summarize/route.ts                # transkript → Groq LLM (strict JSON)
│     ├─ action-items/[id]/route.ts        # PATCH owner/due_date/done
│     └─ export/[id]/route.ts             # ?format=md|srt|txt|json
├─ components/  Recorder.tsx, LevelMeter.tsx, LiveTranscript.tsx, SummaryView.tsx, ActionItemsTable.tsx, AudioPlayer.tsx
├─ hooks/       useRecorder.ts, useUploadQueue.ts
├─ lib/
│  ├─ groq.ts               # tek Groq istemcisi (maxRetries, timeout)
│  ├─ transcribe.ts         # prompt zinciri, halüsinasyon filtresi, ofsetleme
│  ├─ summarize.ts          # tek çağrı / map-reduce, Zod doğrulama, retry
│  ├─ prompts.ts            # TR sistem/kullanıcı/reduce prompt'ları
│  ├─ schema.ts             # JSON Schema (Groq) + Zod şeması
│  ├─ audio/ffmpeg.ts       # >25 MB: FLAC 16k mono + 600 sn/10 sn örtüşme
│  ├─ export.ts             # md / srt / txt üreticileri
│  └─ db/  schema.ts, client.ts, migrate.ts
├─ data/  app.db, audio/<noteId>/...      # .gitignore
├─ drizzle.config.ts
└─ .env.local               # GROQ_API_KEY=..., GROQ_CHAT_MODEL=openai/gpt-oss-120b, LLM_INPUT_BUDGET=5000
```

---

## 5. MVP Kapsamı

**v1 (bu dokümanla inşa edilecek)**
- [ ] Not oluşturma formu: başlık, katılımcılar (virgülle), dil (`tr` / `en` / otomatik), "sekme sesini de kaydet" anahtarı
- [ ] Mikrofon kaydı (her tarayıcı) + Chrome/Edge'de `getDisplayMedia` sekme sesi, Web Audio ile karıştırma, ses seviyesi göstergesi
- [ ] 30 sn döndürmeli `MediaRecorder` + paralel arşiv kaydedici; sessiz chunk atlama; sıralı yükleme kuyruğu + retry
- [ ] `/api/transcribe`: `whisper-large-v3-turbo`, `language`, glossary + önceki kuyruk `prompt`'u, `verbose_json`, halüsinasyon filtresi, zaman ofsetleme
- [ ] Canlı transkript görünümü (zaman damgalı bloklar, "yazıya dökülüyor…" yer tutucu)
- [ ] Dosya yükleme (MP3/WAV/M4A/MP4/WEBM/OGG, ≤25 MB doğrudan; ffmpeg varsa >25 MB parçalama)
- [ ] `/api/summarize`: strict JSON şema, Zod doğrulama + retry, Free tier için map-reduce, Dev tier için tek çağrı (`LLM_INPUT_BUDGET`)
- [ ] Not detayı: Transkript (tıkla → sese atla) | Özet (tldr, ana noktalar, kararlar, riskler, açık sorular, sonraki adımlar) | Aksiyonlar (düzenlenebilir tablo: görev/sahip/tarih/öncelik/yapıldı + "kaynağa git")
- [ ] Ses oynatıcı (tam dosya, `fix-webm-duration` ile atlanabilir)
- [ ] Dışa aktarma: Markdown, TXT, SRT, JSON; "özeti panoya kopyala"
- [ ] SQLite kalıcılık; not listesi; silme; durum göstergesi (kaydediliyor / yazıya dökülüyor / özetleniyor / hazır / hata)
- [ ] Rate limit / 413 / 429 durumlarında anlaşılır hata ve otomatik yeniden deneme

**v2'ye ertelenenler**
- İki akışlı "Ben / Diğerleri" konuşmacı etiketi (mikrofon ve sekme sesini ayrı kaydedip ayrı transkribe etme; Whisper isteği ve ses-saniye kotası 2×)
- Gerçek diarization (pyannote/WhisperX Python yan servisi) ve konuşma süresi grafiği
- AI Chat (transkript + soru → LLM, zaman damgalı alıntı; Dev tier TPM gerektirir), çoklu not sorgusu
- Mind map (LLM konu ağacı → Mermaid `mindmap`), tek tıkla çeviri
- Canlı ara altyazı için Web Speech API (`tr-TR`, Chrome/Safari) fallback'i
- Notion API / Slack webhook / e-posta push, ICS/takvim, Zapier
- Çok kullanıcılı hesap, workspace, şablonlar, PDF/DOCX
- YouTube linki, PDF OCR, toplantı botu (Vexa/meet-teams-bot entegrasyonu)
- Yerel/offline STT seçeneği (whisper.cpp)

---

## 6. Riskler ve Bilinmeyenler

- **Tarayıcı desteği:** sekme/sistem sesi yalnızca Chromium masaüstünde (~%31 küresel kapsama); Firefox (bug 1541425 hâlâ açık) ve Safari sessizce 0 ses track'i döner; mobilde hiç yok. macOS'ta uygulama/sistem sesi için **macOS 14.2+ ve Chrome 141+** şart, yoksa sekme paylaşımı veya mikrofon. Kullanıcı "Sekme sesini paylaş" kutusunu işaretlemezse ses gelmez → UI'da kontrol ve uyarı zorunlu. `getDisplayMedia` yalnızca kullanıcı tıklamasından çağrılabilir.
- **Groq Free tier darboğazları:** LLM **8.000 TPM** → 1 saatlik toplantı map-reduce ile ~4–6 dk sürer; Whisper 7.200 ses-sn/saat (iki akışlı diarization ile 1 saatlik toplantı kotayı doldurur); 25 MB dosya limiti. **Öneri: ilk günden Developer tier'a geçin** (kart, abonelik yok, toplantı başına ~$0.05).
- **Model istikrarı:** Llama modelleri Free/Dev'den kaldırıldı; `qwen/qwen3.8-27b` preview ("kısa sürede kaldırılabilir"); `qwen/qwen3.6-27b` belirsiz. Model ID'sini env'de tutun, `GET /openai/v1/models` ile başlangıçta doğrulayın.
- **Türkçe özet kalitesi:** gpt-oss ailesi için İngilizce dışı zayıflık bildirimleri var; Qwen3 Türkçe'yi resmî destekliyor ama 5× pahalı ve preview. Hiçbiri Türkçe için ölçülmedi → ilk iş 3 gerçek toplantıyla A/B.
- **Türkçe transkript kalitesi:** Whisper-large-v3 Türkçe veri setlerinde %4,3–14,2 WER (akademik); turbo daha kötü; Groq per-dil WER yayınlamıyor. `language:"tr"` ve isim sözlüğü prompt'u şart; gürültülü toplantı sesinde beklentiyi düşük tutun. Karışık TR/EN toplantılarda `language` sabitlemek İngilizce cümleleri bozabilir → "otomatik" seçeneği bırakın.
- **Halüsinasyon:** sessizlikte Whisper "Altyazı M.K.", "İzlediğiniz için teşekkürler" üretir → RMS kapısı + kara liste + `no_speech_prob`; Groq'un `verbose_json`'da bu alanları döndürdüğünü canlı yanıtla doğrulayın.
- **Structured Outputs güvenilirliği:** gpt-oss-120b'nin şemayı bazen yok saydığı raporlandı → Zod doğrulama + retry kalıcı olmalı; strict mod streaming ile çalışmaz (özet için streaming gerekmiyor).
- **Parça sınırları:** kaydedici döndürmede birkaç ms kayıp/örtüşme; sınırda %2–5 ek hata; `prompt` zinciri bir halüsinasyonu sonraki chunk'a taşıyabilir (sessiz chunk'ta zinciri kes).
- **Diarization yok:** Groq konuşmacı etiketi vermez; v1'de yalnızca zaman damgası, owner çıkarımı tamamen "isim söylendi mi"ye bağlı. İki akışlı "Ben/Diğerleri" v2'de ucuz ve %100 doğru ama yalnızca 2 sınıf.
- **MediaRecorder WebM'i atlanamaz** (süre başlığı yok) → `fix-webm-duration` veya sunucuda `ffmpeg -c copy -cues_to_front 1`.
- **Hukuk/gizlilik:** kayıt için karşı taraf rızası (KVKK/TCK 132–133); ses Groq'a gider (ABD) → kullanıcıya açıkça söyleyin. HiNoter'ın adını/markasını/arayüz görsellerini kopyalamayın (rebranded "Recorder Pro", AISION PTE. LTD.).
- **Bilinmeyenler:** HiNoter'ın gerçek STT/LLM tedarikçisi, Free plan dakika limiti, maksimum yükleme süresi, botun canlı transkript verip vermediği, ve `app.hinoter.com` dashboard etiketleri (SPA yüklenemedi) doğrulanamadı.

---

## 7. Kaynaklar

**HiNoter**
- https://hinoter.com/ · https://hinoter.com/pricing · https://hinoter.com/features/ai-meeting-notes · https://hinoter.com/features/meeting-assistant · https://hinoter.com/features/ai-chat · https://hinoter.com/features/audio-to-text · https://hinoter.com/features/multilingual-support · https://hinoter.com/features/youtube-transcript-generator · https://hinoter.com/features/video-to-text
- https://hinoter.com/integrations/notion · https://hinoter.com/integrations/google-meet · https://hinoter.com/integrations/microsoft-teams
- https://hinoter.com/blog/how-to-transcribe-a-meeting-2 · https://hinoter.com/blog/ai-meeting-recorder-transcripts-summaries · https://hinoter.com/blog/otter-ai-alternative · https://hinoter.com/blog/10-best-ai-note-takers-in-2026-tested-compared · https://hinoter.com/tr/blog/ai-meeting-assistants
- https://apps.apple.com/us/app/hinoter-ai-note-taker/id6747097475 · https://apps.apple.com/tr/app/hinoter-ai-not-tutucu/id6747097475?l=tr · https://play.google.com/store/apps/details?id=com.recordpro.audiorecord · https://mwm.ai/apps/hinoter-al-note-taker/6747097475

**Groq**
- https://console.groq.com/docs/speech-to-text · https://console.groq.com/docs/model/whisper-large-v3-turbo · https://console.groq.com/docs/model/whisper-large-v3
- https://console.groq.com/docs/models · https://console.groq.com/docs/deprecations · https://console.groq.com/docs/rate-limits · https://console.groq.com/docs/billing-faqs · https://console.groq.com/docs/errors
- https://console.groq.com/docs/structured-outputs · https://console.groq.com/docs/tool-use · https://console.groq.com/docs/reasoning · https://console.groq.com/docs/openai · https://console.groq.com/docs/libraries · https://console.groq.com/docs/changelog
- https://console.groq.com/docs/model/openai/gpt-oss-120b · https://console.groq.com/docs/model/qwen/qwen3.8-27b
- https://github.com/groq/groq-typescript · https://github.com/groq/groq-api-cookbook (tutorials/audio-chunking) · https://community.groq.com/t/structured-outputs-ignored-by-openai-gpt-oss-120b/687 · https://github.com/continuedev/continue/issues/10218 (413 TPM)

**Tarayıcı ses API'leri**
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia · https://caniuse.com/mdn-api_mediadevices_getdisplaymedia_audio_capture_support · https://bugzilla.mozilla.org/show_bug.cgi?id=1541425
- https://developer.chrome.com/release-notes/141 · https://blog.addpipe.com/getdisplaymedia-allows-capturing-the-screen-with-system-sounds-on-chrome-on-macos/ · https://addpipe.com/getdisplaymedia-demo/
- https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/start · https://github.com/w3c/mediacapture-record/issues/178 · https://github.com/chrisguttandin/extendable-media-recorder/issues/638 · https://media-codings.com/articles/recording-cross-browser-compatible-media
- https://dev.to/puspaksahu17/how-to-record-google-meet-and-zoom-calls-with-dual-audio-using-the-html5-mediarecorder-api-611 · https://deepgram.com/learn/transcribing-browser-tab-audio-chrome-extensions · https://www.ffmpeg-micro.com/blog/mediarecorder-webm-isn-t-broken-convert-it-to-mp4-server-side
- https://developers.openai.com/cookbook/examples/whisper_prompting_guide · https://github.com/openai/whisper/discussions/2412 (Türkçe halüsinasyon) · https://www.mdpi.com/2079-9292/13/21/4227 (Türkçe WER)

**Prompt tasarımı ve açık kaynak referanslar**
- https://www.assemblyai.com/blog/summarize-meetings-llms-python · https://www.gladia.io/blog/transcript-to-actionable-notes-llm · https://www.recall.ai/blog/speaker-diarization
- https://github.com/Zackriya-Solutions/meetily · https://raw.githubusercontent.com/Zackriya-Solutions/meetily/main/frontend/src-tauri/templates/standard_meeting.json · https://github.com/fastrepl/anarlog · https://github.com/thewh1teagle/vibe · https://github.com/thepersonalaicompany/amurex · https://github.com/Vexa-ai/vexa · https://github.com/Meeting-BaaS/meet-teams-bot · https://github.com/misbahsy/meetingmind · https://github.com/talberthoule/backchannel
- https://raw.githubusercontent.com/Vishu-0105/ai-meeting-summarizer/main/backend/app/prompts/meeting_analysis.py (anti-halüsinasyon "Prompt B") · https://raw.githubusercontent.com/hareesh-star/Meeting-summarizer/main/backend/services/summarizer.py
- https://qwenlm.github.io/blog/qwen3/ · https://ollama.com/library/llama3.3 · https://github.com/WiseLibs/better-sqlite3/discussions/1245