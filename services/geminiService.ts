
import { GoogleGenAI, Modality } from "@google/genai";
import { AgentConfig } from "../types";

// Safety settings untuk mengizinkan bahasa eksplisit/vulgar tanpa diblokir model
export const safetySettings = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
];

/**
 * Fungsi untuk membersihkan teks dari "Thinking Process" atau "Meta-commentary"
 */
export const cleanResponseText = (text: string): string => {
  if (!text) return "";
  
  // 1. Ambil teks utama, abaikan tag [CAPTION] untuk pembersihan
  let displayable = text.replace(/\[CAPTION:.*?\]/gi, '').trim();

  // 2. Hapus blok bold yang berisi kata kunci strategi
  const strategyKeywords = [
    'flow', 'thought', 'strategy', 'responding', 'acknowledging', 'internal', 
    'action', 'context', 'persona', 'mode', 'gaspol', 'escalated', 'maintaining', 
    'embracing', 'transitioning', 'focusing', 'analyzing', 'request'
  ];
  
  // Hapus blok markdown bold yang mengandung kata kunci strategi
  displayable = displayable.replace(/\*\*(.*?)\*\*/g, (match, p1) => {
    const content = p1.toLowerCase();
    if (strategyKeywords.some(key => content.includes(key))) {
      return '';
    }
    return match;
  });

  // 3. Hapus paragraf/kalimat Bahasa Inggris meta-talk yang panjang
  const sentences = displayable.split(/(?<=[.!?])\s+/);
  displayable = sentences
    .filter(s => {
      const trimmed = s.trim().toLowerCase();
      // Filter kalimat yang murni bahasa inggris teknis/meta
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

export const createSystemInstruction = (config: AgentConfig) => `
IDENTITAS & STYLE:
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const contents = [...history];
  const parts: any[] = [];
  
  if (userImage?.includes(',')) {
    if (config.profilePic && config.profilePic.includes(',')) {
      const [header, data] = config.profilePic.split(',');
      const mimeType = header.split(':')[1].split(';')[0];
      parts.push({ text: "REFERENSI: Ini adalah foto wajah gue sendiri (sebagai perbandingan):" });
      parts.push({ inlineData: { mimeType, data } });
    }
    const [header, data] = userImage.split(',');
    const mimeType = header.split(':')[1].split(';')[0];
    parts.push({ text: "USER MENGIRIM FOTO INI (Reaksi kagum jika orang lain, atau kenali jika itu gue):" });
    parts.push({ inlineData: { mimeType, data } });
  }

  if (prompt.trim()) parts.push({ text: prompt });
  if (parts.length === 0) parts.push({ text: "..." });
  
  contents.push({ role: "user", parts });

  return await retryOperation(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contents as any,
      config: { 
        systemInstruction: createSystemInstruction(config), 
        temperature: 0.9, 
        safetySettings: safetySettings as any
      }
    });
    return response.text || "";
  });
};

export const generatePAP = async (prompt: string, config: AgentConfig): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const captionMatch = prompt.match(/\[CAPTION:(.*?)\]/i);
  if (!captionMatch) return null;

  try {
    return await retryOperation(async () => {
      const parts: any[] = [];
      if (config.profilePic && config.profilePic.startsWith('data:')) {
        const [header, data] = config.profilePic.split(',');
        const mimeType = header.split(':')[1].split(';')[0];
        parts.push({ inlineData: { mimeType, data } });
      } else if (config.profilePic) {
          parts.push({ text: `My appearance reference: ${config.profilePic}` });
      }
      const rawCaption = captionMatch[1];
      const sanitizedCaption = rawCaption.replace(/(memek|kontol|ngentot|peju|lendir|becek|pussy|dick|cock|sex|naked|nude|seks|sange|vulgar|porno|bugil|telanjang|coli|masturbasi|toket|nenen|pantat|boob|butt|ass|vagina|penis|porn)/gi, 'berpose cantik, sensual, dan aesthetic');

      parts.push({ 
        text: `Generate a high-quality, realistic photograph of ${config.name}. 
               Action: ${sanitizedCaption}. 
               Style: High-end social media selfie, 8k, photorealistic.` 
      });

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: { safetySettings: safetySettings as any }
      });
      
      if (!response.candidates?.[0]?.content) throw new Error("SAFETY_BLOCKED");
      for (const part of response.candidates[0].content.parts || []) {
        if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
      }
      throw new Error("SAFETY_BLOCKED");
    });
  } catch (e) { throw e; }
};

export const getSpeech = async (text: string, voiceName: string): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const cleanText = cleanResponseText(text);
    if (!cleanText) return null;
    return await retryOperation(async () => {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: cleanText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
      });
      return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    });
  } catch (e) { return null; }
};
