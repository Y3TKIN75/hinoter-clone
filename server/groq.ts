// Tek Groq istemcisi + yapılandırma. API anahtarı yalnızca sunucuda yaşar.
import Groq from 'groq-sdk';

export const STT_MODEL = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';
export const CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-120b';
export const LLM_INPUT_BUDGET = Number(process.env.LLM_INPUT_BUDGET || 5000);
export const HAS_API_KEY = !!process.env.GROQ_API_KEY;

// maxRetries: 429'da SDK retry-after header'ına uyarak bekler.
export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || 'missing',
  baseURL: process.env.GROQ_BASE_URL || undefined, // test/proxy için; normalde boş bırakın
  maxRetries: 5,
  timeout: 180_000,
});

export let modelsVerified: boolean | null = null;
export const modelWarnings: string[] = [];

/** Başlangıçta yapılandırılan model ID'lerinin hesapta erişilebilir olduğunu doğrular. */
export async function verifyModels() {
  if (!HAS_API_KEY) {
    modelWarnings.push('GROQ_API_KEY tanımlı değil — .env dosyasını doldurun.');
    modelsVerified = false;
    return;
  }
  try {
    const list = await groq.models.list();
    const ids = new Set(list.data.map((m) => m.id));
    for (const m of [STT_MODEL, CHAT_MODEL]) {
      if (!ids.has(m)) modelWarnings.push(`Model "${m}" hesabınızda listelenmiyor (kaldırılmış veya erişim yok olabilir). Bkz. https://console.groq.com/docs/models`);
    }
    modelsVerified = modelWarnings.length === 0;
  } catch (e) {
    modelsVerified = false;
    modelWarnings.push(`Groq model listesi alınamadı: ${errorMessage(e)}`);
  }
}

/** Groq/ağ hatalarını kullanıcıya gösterilebilir Türkçe mesaja çevirir. */
export function errorMessage(e: unknown): string {
  if (e instanceof Groq.APIError) {
    const status = e.status;
    const body = typeof e.error === 'object' && e.error ? JSON.stringify(e.error) : String(e.message);
    if (status === 401) return 'Groq API anahtarı geçersiz (401). .env içindeki GROQ_API_KEY değerini kontrol edin.';
    if (status === 413) return `İstek çok büyük (413). Dosya 25 MB sınırını ya da model TPM limitini aşıyor. ${body}`;
    if (status === 429) return `Groq rate limit aşıldı (429). Bir süre bekleyip tekrar deneyin ya da Developer tier'a geçin. ${body}`;
    if (status === 404) return `Model bulunamadı (404): ${body}`;
    return `Groq hatası (${status ?? '?'}): ${body}`;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

export function errorStatus(e: unknown): number {
  if (e instanceof Groq.APIError && e.status) return e.status;
  return 500;
}
