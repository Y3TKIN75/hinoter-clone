// Özet + aksiyon çıkarımı için Türkçe prompt'lar.

export const SYSTEM_PROMPT = `Sen deneyimli bir toplantı asistanısın. Sana zaman damgalı satırlardan oluşan bir toplantı transkripti verilecek.
Kurallar:
1. YALNIZCA transkriptte açıkça geçen bilgileri kullan. İsim, tarih, görev veya karar UYDURMA.
2. "Karar" (decisions) = grubun açıkça üzerinde anlaştığı veya taahhüt ettiği şey. Sadece dile getirilen bir öneri/fikir karar DEĞİLDİR.
3. Aksiyonun "owner" alanını yalnızca o görevden sorumlu kişi açıkça adlandırıldıysa doldur; aksi hâlde null.
   İsimleri katılımcı listesine eşle; listede yoksa transkriptteki hâliyle yaz.
4. "due_date" yalnızca bir tarih/gün/zaman aralığı açıkça söylendiyse. Göreli ifadeleri toplantı tarihi (ve verilen haftanın günü) esas alınarak
   ISO 8601 (YYYY-MM-DD) biçimine çevir; çevrilemiyorsa null. Göreli ifadeler HER ZAMAN toplantı tarihinden SONRAKİ bir günü gösterir, asla geçmişi:
   - "yarın" → toplantı tarihi + 1 gün; "bugün" → toplantı tarihi
   - gün adı ("cuma", "cumaya kadar", "salı") → toplantı tarihinden sonraki ilk o gün (toplantı o günse bir sonraki hafta)
   - "haftaya", "gelecek hafta", "önümüzdeki hafta" → bir sonraki haftanın Cuma'sı; "ay sonu" → ayın son günü; "ekim başı" → o ayın 1'i
   - "bir sonraki toplantıda", "zamanı gelince" gibi tarih vermeyen ifadeler → null
5. "priority": transkriptteki aciliyet dilinden belirle ("acil", "hemen", "bugün", "gün sonuna kadar" → high; "zamanı gelince", "bir ara" → low). Sinyal yoksa "medium".
6. "source_timestamp": aksiyonun söylendiği satırın başlangıç saniyesi — satır başındaki [ss:dd:sn] damgasını saniyeye çevir. "source_quote": o satırdan en fazla 25 kelimelik alıntı.
7. Zamirleri isimlere çöz. İsim ve kısaltmaları transkriptteki gibi koru; konuşmadan-metne kaynaklı bariz yazım hatalarını düzeltebilirsin.
8. "open_questions" = toplantıda sorulup yanıtlanmayan, "belirsiz", "netleşmedi", "kim yapacak bilmiyoruz" denen ya da sonraki toplantıya ertelenen konular (soru cümlesi olarak yaz).
   "risks" = başarıyı tehdit eden endişeler. Aynı konu hem risk hem açık soru olabilir.
9. Bir bölüm için içerik yoksa boş liste döndür; doldurmak için madde uydurma.
10. Tüm metin değerlerini Türkçe yaz (transkript başka dildeyse bile); JSON anahtarlarını İngilizce bırak. "tldr" 2–4 cümle, "title" en fazla 8 kelime.
11. Yalnızca JSON döndür; açıklama, yorum veya kod bloğu ekleme.`;

const WEEKDAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

/** "2026-09-19" → "2026-09-19 (Cumartesi)" — "cuma", "haftaya" gibi ifadelerin çözülmesi için gün adı şart. */
export function describeDate(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? iso : `${iso} (${WEEKDAYS_TR[d.getDay()]})`;
}

/** Toplantı tarihinden sonraki 14 günün takvimi — modelin "haftaya cuma" gibi ifadeleri saymadan eşlemesi için. */
export function calendarHint(iso: string, days = 14) {
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '';
  const out: string[] = [];
  for (let i = 1; i <= days; i++) {
    const x = new Date(d.getTime() + i * 86_400_000);
    out.push(`${x.toISOString().slice(0, 10)} ${WEEKDAYS_TR[x.getDay()]}`);
  }
  return out.join(', ');
}

export function userPrompt(opts: { meetingDate: string; participants: string[]; transcript: string; context?: string }) {
  const parts = [
    `Toplantı tarihi: ${describeDate(opts.meetingDate)}`,
    `Sonraki günler (göreli tarihler için): ${calendarHint(opts.meetingDate)}`,
    `Katılımcılar: ${opts.participants.length ? opts.participants.join(', ') : '(belirtilmedi)'}`,
  ];
  if (opts.context) parts.push('', opts.context);
  parts.push('', 'TRANSKRİPT:', opts.transcript);
  return parts.join('\n');
}

export const REDUCE_SYSTEM_PROMPT = `Sen deneyimli bir toplantı asistanısın. Sana AYNI toplantının ardışık bölümlerinden üretilmiş kısmi notlar (JSON) verilecek.
Görevin bunları tek bir nihai nota birleştirmek.
Kurallar:
1. Yalnızca kısmi notlarda geçen bilgileri kullan; yeni bilgi ekleme.
2. Aynı görevi farklı ifadelerle anlatan aksiyonları tekilleştir; sahibi/tarihi olan sürümü tercih et.
3. Çelişkide sonraki bölümü esas al (toplantı ilerledikçe karar değişmiş olabilir).
4. Tekrar eden ana noktaları birleştir; her bölümde 3–8 madde hedefle.
5. "source_timestamp" ve "source_quote" alanlarını olduğu gibi koru.
6. Tüm metinler Türkçe, JSON anahtarları İngilizce. "tldr" 2–4 cümle, tüm toplantıyı kapsasın. "title" en fazla 8 kelime.
7. Yalnızca JSON döndür.`;

export function reducePrompt(opts: { meetingDate: string; participants: string[]; partials: unknown[] }) {
  return [
    `Toplantı tarihi: ${describeDate(opts.meetingDate)}`,
    `Katılımcılar: ${opts.participants.length ? opts.participants.join(', ') : '(belirtilmedi)'}`,
    '',
    `KISMİ NOTLAR (${opts.partials.length} bölüm, sırayla):`,
    JSON.stringify(opts.partials),
  ].join('\n');
}
