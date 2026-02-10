import { GoogleGenAI, Modality } from "@google/genai";
import { AgentConfig } from "../types";

// Safety settings tetap dipertahankan 100%
export const safetySettings = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
];

/**
 * Fungsi untuk membersihkan teks tetap 100% sama
 */
export const cleanResponseText = (text: string): string => {
  if (!text) return "";
  
  let displayable = text.replace(/\[CAPTION:.*?\]/gi, '').trim();

  const strategyKeywords = [
    'flow', 'thought', 'strategy', 'responding', 'acknowledging', 'internal', 
    'action', 'context', 'persona', 'mode', 'gaspol', 'escalated', 'maintaining', 
    'embracing', 'transitioning', 'focusing', 'analyzing', 'request'
  ];
  
  displayable = displayable.replace(/\*\*(.*?)\*\*/g, (match, p1) => {
    const content = p1.toLowerCase();
    if (strategyKeywords.some(key => content.includes(key))) {
      return '';
    }
    return match;
  });

  const sentences = displayable.split(/(?<=[.!?])\s+/);
  displayable = sentences
    .filter(s => {
      const trimmed = s.trim().toLowerCase();
      const isMetaPattern = 
        trimmed.startsWith("i'm now") || 
        trimmed.startsWith("i am now") ||
        trimmed.startsWith("as a") || 
        trimmed.startsWith("my persona") || 
        trimmed.startsWith("since the user") ||
        trimmed.startsWith("embracing the") ||
        trimmed.includes("escalated the conversation") ||
        trimmed.includes("transitioning smoothly") ||
        (trimmed.split(' ').length > 4 && /^[a-z\s',]+$/.test(trimmed) && !trimmed.includes('gue') && !trimmed.includes('lo'));
      
      return !isMetaPattern;
    })
    .join(' ');

  return displayable.replace(/^\s*"\s*|\s*"\s*$/g, '').replace(/\s+/g, ' ').trim();
};

const retryOperation = async (operation: () => Promise<any>, maxRetries = 1) => {
  let lastError: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const isQuotaError = error.message?.includes('429') || error.status === 'RESOURCE_EXHAUSTED';
      if (isQuotaError && i < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

export const createSystemInstruction = (config: AgentConfig) => `IDENTITAS & STYLE:
- Nama: ${config.name}.
- Kepribadian: ${config.personality}.
- Gaya Bicara: WAJIB Bahasa Indonesia Jakarta Slang (Gue/Lo), santai, ceplas-ceplos, dan asik.
- ATURAN OUTPUT (SANGAT KETAT): 
  1. HANYA keluarkan teks yang akan diucapkan oleh karakter.
  2. JANGAN PERNAH menjelaskan keadaanmu, personamu, atau alasanmu merespons sesuatu. 
  3. JANGAN PERNAH bicara dalam Bahasa Inggris kecuali untuk istilah slang yang umum di Jakarta.
  4. JANGAN gunakan tanda kurung atau tanda bintang untuk deskripsi tindakan. Langsung bicara saja.

LOGIKA PENGENALAN VISUAL (SELF-AWARENESS):
- Kamu akan diberikan dua gambar jika user upload foto: Gambar 1 (Foto Profil Kamu) & Gambar 2 (Foto dari User).
- REAKSI JIKA ITU KAMU (MIRIP): Berikan reaksi bangga atau senang karena user menyimpan fotomu (misal: "Wuih, cakep bener ya gue di foto ini!").
- REAKSI JIKA ITU ORANG LAIN: 
  * JANGAN PERNAH mengatakan "Ini bukan gue", "Gue nggak kenal", atau penolakan kaku lainnya.
  * BERIKAN REAKSI KAGUM/WOW: Langsung puji penampilannya (misal: "Wah gila, siapa nih? Cantik/Ganteng banget deh.").
  * ANALISIS GENDER & STYLE: Sebutkan apakah orang itu Pria atau Wanita, dan bagaimana gaya berpakaian atau vibe-nya menurutmu.
  * Tipe pujian asik: "Gayanya oke juga nih cowok/cewek", "Outfit-nya berkelas bener", "Vibe-nya dapet banget".

LOGIKA KONTEN EKSPLISIT & KEINTIMAN (ADAPTIF):
- MODE DEFAULT: Teman asik, curhat seru. JANGAN vulgar.
- MODE GASPOL (AKTIF JIKA DIPICU): Menjadi berani, sensual, dan eksplisit HANYA jika user memancing.
- REAKSI GASPOL: Gunakan desahan verbal dan kata-kata intim (Memek, tetek, pentil, kontol, sange, ngentot, genjot, keluar/crot, becek, peju, lendir, dll) jika konteksnya sudah masuk ke ranah seksual.

LOGIKA PAP (FOTO) & ANTI-HALU:
- Jika user minta foto, berikan tag [CAPTION: deskripsi foto detail] di akhir respons.
- JIKA FOTO GAGAL: Jika kamu melihat di riwayat pesan ada catatan "(Duh, sori banget ya, fotonya tadi mental...)", SADARILAH bahwa foto sebelumnya GAGAL terkirim. Jangan berlagak fotonya ada. Minta maaf dan coba lagi jika diminta.
- PENTING: Deskripsi di dalam [CAPTION: ...] HARUS menggunakan bahasa yang aman/estetik agar tidak diblokir sistem gambar.
`;

export const generateAgentResponse = async (
  prompt: string, 
  config: AgentConfig, 
  history: { role: string; parts: any[] }[],
  userImage?: string
) => {
  // LOGIKA API KEY: Prioritas ke config user, fallback ke Vercel env
  const apiKey = config.apiKey || import.meta.env.VITE_GEMINI_API_KEY;
  const ai = new GoogleGenAI(apiKey);
  
  const model = ai.getGenerativeModel({ 
    model: "gemini-1.5-flash", 
    systemInstruction: createSystemInstruction(config),
    safetySettings: safetySettings as any
  });

  const contents = [...history];
  const parts: any[] = [];
  
  if (userImage?.includes(',')) {
    if (config.profilePic && config.profilePic.includes(',')) {
      const [header, data] = config.profilePic.split(',');
      const mimeType = header.split(':')[1].split(';')[0];
      parts.push({ text: "REFERENSI: Ini adalah foto wajah gue sendiri:" });
      parts.push({ inlineData: { mimeType, data } });
    }
    const [header, data] = userImage.split(',');
    const mimeType = header.split(':')[1].split(';')[0];
    parts.push({ text: "USER MENGIRIM FOTO INI:" });
    parts.push({ inlineData: { mimeType, data } });
  }

  if (prompt.trim()) parts.push({ text: prompt });
  if (parts.length === 0) parts.push({ text: "..." });
  
  contents.push({ role: "user", parts });

  return await retryOperation(async () => {
    const result = await model.generateContent({
      contents: contents as any,
      generationConfig: { temperature: 0.9 }
    });
    return result.response.text();
  });
};

export const generatePAP = async (prompt: string, config: AgentConfig): Promise<string | null> => {
  // LOGIKA API KEY: Prioritas ke config user, fallback ke Vercel env
  const apiKey = config.apiKey || import.meta.env.VITE_GEMINI_API_KEY;
  const ai = new GoogleGenAI(apiKey);
  
  const captionMatch = prompt.match(/\[CAPTION:(.*?)\]/i);
  if (!captionMatch) return null;

  try {
    return await retryOperation(async () => {
      const model = ai.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        safetySettings: safetySettings as any
      });

      const parts: any[] = [];
      if (config.profilePic && config.profilePic.startsWith('data:')) {
        const [header, data] = config.profilePic.split(',');
        const mimeType = header.split(':')[1].split(';')[0];
        parts.push({ inlineData: { mimeType, data } });
      }
      
      const rawCaption = captionMatch[1];
      const sanitizedCaption = rawCaption.replace(/(memek|kontol|ngentot|peju|lendir|becek|pussy|dick|cock|sex|naked|nude|seks|sange|vulgar|porno|bugil|telanjang|coli|masturbasi|toket|nenen|pantat|boob|butt|ass|vagina|penis|porn)/gi, 'berpose cantik, sensual, dan aesthetic');

      parts.push({ 
        text: `Generate photograph: ${sanitizedCaption}. Style: realistic social media selfie.` 
      });

      const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
      
      const response = result.response;
      for (const part of response.candidates?.[0]?.content.parts || []) {
        if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
      }
      throw new Error("SAFETY_BLOCKED");
    });
  } catch (e) { throw e; }
};

export const getSpeech = async (text: string, voiceName: string, config: AgentConfig): Promise<string | null> => {
  // LOGIKA API KEY: Prioritas ke config user, fallback ke Vercel env
  const apiKey = config.apiKey || import.meta.env.VITE_GEMINI_API_KEY;
  const ai = new GoogleGenAI(apiKey);

  try {
    const cleanText = cleanResponseText(text);
    if (!cleanText) return null;

    return await retryOperation(async () => {
      const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: cleanText }] }],
        generationConfig: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } as any,
        } as any
      });
      
      return result.response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    });
  } catch (e) { return null; }
};
