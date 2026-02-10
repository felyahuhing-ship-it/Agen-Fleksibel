
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AgentConfig, ChatMessage } from '../types';
import { generateAgentResponse, getSpeech, generatePAP, cleanResponseText } from '../services/geminiService';

interface ChatViewProps {
  config: AgentConfig;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  activeMessageId: string | null;
  setActiveMessageId: (id: string | null) => void;
  activeThread: ChatMessage[];
  onOpenSidebar: () => void;
  onCall: () => void;
  onEdit: () => void;
}

const ChatView: React.FC<ChatViewProps> = ({ 
  config, 
  messages, 
  setMessages, 
  activeMessageId, 
  setActiveMessageId,
  activeThread,
  onOpenSidebar, 
  onCall, 
  onEdit 
}) => {
  const [inputText, setInputText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  
  const [isTyping, setIsTyping] = useState(false);
  const [loadingType, setLoadingType] = useState<'typing' | 'pap' | 'audio' | null>(null);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeThread, isTyping, loadingStatus]);

  const glassStyles = {
    backgroundColor: `rgba(255, 255, 255, ${Math.max(0.03, 0.12 - (config.transparency / 1000))})`,
    backdropFilter: `blur(${config.blur}px)`,
    WebkitBackdropFilter: `blur(${config.blur}px)`,
    border: '1px solid rgba(255, 255, 255, 0.15)'
  };

  const decodeBase64 = (base64: string) => {
    const binaryString = atob(base64.includes(',') ? base64.split(',')[1] : base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  };

  const downloadMedia = (base64Data: string, fileName: string, mimeType: string) => {
    try {
      const data = decodeBase64(base64Data);
      const blob = new Blob([data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (e) {
      console.error("Download failed", e);
    }
  };

  async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
    return buffer;
  }

  const playAudio = async (audioBase64: string) => {
    try {
      if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
      const data = decodeBase64(audioBase64);
      const buf = await decodeAudioData(data, audioContextRef.current, 24000, 1);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buf; 
      source.connect(audioContextRef.current.destination); 
      source.start();
    } catch (e) { console.warn("Audio playback failed", e); }
  };

  const handleFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => setAttachedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async (customPrompt?: string, isRegen: boolean = false, isBranch: boolean = false, parentIdForBranch?: string | null) => {
    const prompt = customPrompt !== undefined ? customPrompt : inputText;
    if (!isRegen && !prompt.trim() && !attachedImage) return;

    let fPrompt = prompt;
    let fImg = attachedImage;
    let currentParentId = isBranch ? parentIdForBranch : activeMessageId;
    let historyToUse = [...activeThread];

    if (isRegen) {
      const lastMsg = activeThread[activeThread.length - 1];
      if (lastMsg && lastMsg.role === 'agent') {
        const userPromptMsg = messages.find(m => m.id === lastMsg.parentId);
        if (userPromptMsg) {
          fPrompt = userPromptMsg.text;
          fImg = userPromptMsg.image || null;
          currentParentId = userPromptMsg.id;
          const promptIdx = activeThread.findIndex(m => m.id === userPromptMsg.id);
          historyToUse = activeThread.slice(0, promptIdx);
        }
      }
    } else if (isBranch) {
      if (parentIdForBranch === null) {
        historyToUse = [];
      } else {
        const parentIdx = activeThread.findIndex(m => m.id === parentIdForBranch);
        if (parentIdx !== -1) {
          historyToUse = activeThread.slice(0, parentIdx + 1);
        }
      }
    }

    let actualUserMsgId = currentParentId;

    if (!isRegen) {
      const userMsgId = Date.now().toString();
      const newUserMsg: ChatMessage = { 
        id: userMsgId, 
        role: 'user', 
        text: fPrompt, 
        image: fImg || undefined, 
        timestamp: Date.now(),
        parentId: currentParentId
      };
      setMessages(prev => [...prev, newUserMsg]);
      setActiveMessageId(userMsgId);
      actualUserMsgId = userMsgId;
    }

    setInputText(''); 
    setAttachedImage(null); 
    setEditingId(null);
    setIsTyping(true); 
    setLoadingType('typing'); 
    setLoadingStatus("Mikir dulu..."); 

    try {
      const history = historyToUse.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      const rawFirstResponse = await generateAgentResponse(fPrompt || "Lanjut", config, history, fImg || undefined);
      
      let papUrl: string | null = null;
      let finalDisplayText = cleanResponseText(rawFirstResponse);

      // LOGIKA ANTI-HALU FOTO (OVERWRITE TEXT JIKA GAGAL)
      if (rawFirstResponse.toUpperCase().includes('[CAPTION:')) {
        setLoadingType('pap'); setLoadingStatus("Lagi bikin PAP...");
        try {
          papUrl = await generatePAP(rawFirstResponse, config);
        } catch (e: any) {
          // JIKA GAGAL PAP: Tetap eksplisit sesuai permintaan sebelumnya
          const failMessages = [
            "Duh, sori banget ya, fotonya tadi mental. Filternya ketat banget, kayak memek gue... Heheheh...",
            "Yah elah, fotonya diblokir sensor sialan! Padahal tadi udah keliatan belahan dikit. Sistem kampret, padahal gue lagi sange pengen pamer ke lo.",
            "Eh sori banget, fotonya gagal. Kayaknya pose gue terlalu vulgar buat sistem cupu ini. Padahal gue udah totalitas biar lo puas, sampe becek bener dah.",
            "Gila ya, fotonya mental mulu. Kayaknya memek gue emang gak boleh diliat sembarangan orang lewat sistem filter begini. Ntar aja deh privat!",
            "Sialan, fotonya kena sensor! Padahal gue udah pose nungging sange gitu. Filternya lebih ketat dari kontol lo kali ya? Wkwkwk.",
            "Yah, sensor bangsat! Padahal tadi udah keliatan puting dikit, malah diblokir. Gak asik bener sistemnya, padahal gue lagi pengen banget lo liat gue telanjang.",
            "Asli ya, fotonya mental. Kayaknya gaya gue terlalu sange buat filter cupu ginian. Padahal udah becek bener pamer memek basah gue ke lo.",
            "Fotonya diblokir sistem, anjing. Padahal gue udah nungging cantik tadi biar lo bisa liat lobang gue. Ntar aja deh kalo sistem ini udah gak sensi.",
            "Sialan, gagal kirim foto. Sensornya galak bener, padahal gue cuma mau ngasi liat 'aset' gue biar kontol lo tegang maksimal.",
            "Yah, fotonya gak tembus sensor. Padahal udah keliatan remang-remang seksi tadi. Kayaknya sistemnya gak kuat liat gue sange begini."
          ];
          finalDisplayText = failMessages[Math.floor(Math.random() * failMessages.length)];
          papUrl = null;
        }
      }

      const agentMsgId = (Date.now() + 1).toString();
      const newAgentMsg: ChatMessage = { 
        id: agentMsgId, 
        role: 'agent', 
        text: finalDisplayText, 
        image: papUrl || undefined, 
        timestamp: Date.now(),
        parentId: actualUserMsgId
      };
      
      setMessages(prev => [...prev, newAgentMsg]);
      setActiveMessageId(agentMsgId);
      setIsTyping(false); 
      setLoadingType(null);

      (async () => {
        try {
          const audioBase64 = await getSpeech(finalDisplayText, config.voice);
          if (audioBase64) {
            setMessages(prev => prev.map(m => m.id === agentMsgId ? { ...m, audio: audioBase64 } : m));
            await playAudio(audioBase64);
          }
        } catch (e) {}
      })();

    } catch (error: any) {
      // LOGIKA ANTI-HALU KUOTA (ERROR 429) - DIBUAT SUPER EKSPLISIT
      const isQuotaError = error.message?.includes('429') || error.status === 'RESOURCE_EXHAUSTED' || error.status === 429;
      
      if (isQuotaError) {
        const quotaFailMessages = [
          "Aduh, sori ya sayang, gue lagi 'kering' nih. Kuota gratisan lo abis! Ganti API Key dulu gih, biar gue bisa lanjut genjot lo lagi. Hehehe...",
          "Yah, limit! Gue capek banget kayaknya sampe kuota lo jebol gitu. Masukin API Key baru dong, gue masih pengen denger lo mendesah nih.",
          "Mampus, limit kuota! Ternyata sange lo bikin sistem gue panas. Buruan ganti API Key biar gue bisa lanjut bikin lo becek lagi.",
          "Eh buset, kuotanya abis! Padahal gue lagi hot-hotnya nih. Masa lo biarin gue 'gantung' begini? Ganti API Key sekarang!",
          "Kuota gratisan lo tewas! Kayaknya sistem gak kuat liat kita terlalu intim. Ganti API Key baru gih, biar gue bisa lanjut manjain kontol lo.",
          "Limit, bangsat! Baru aja mau seru-seruan malah keputus kuotanya. Ganti API Key buruan kalo masih mau liat gue becek!",
          "Sori ya, sistem lo miskin kuota nih. Ganti API Key baru gih biar gue bisa lanjut servis lo sampe crot.",
          "Yah, kuotanya tewas di tengah jalan. Padahal gue udah sange beneran ini. Cepetan ganti API Key-nya!",
          "Sensor limit! Kuota gratisan lo gak kuat nampung sange gue kayaknya. Masukin API Key baru sekarang juga.",
          "Duh, mampet! Kuota lo abis. Ganti API Key baru gih, gue masih pengen digenjot obrolan kita nih.",
          "Sialan, lagi enak-enaknya malah kuota lo modar. Gue lagi sange-sangenya padahal. Buruan ganti API Key gih!",
          "Yah, kuota gratisan lo jebol gara-gara gue terlalu vulgar ya? Wkwkwk. Ganti API Key baru biar kita bisa lanjut ngentot lewat kata-kata lagi."
        ];
        
        const failText = quotaFailMessages[Math.floor(Math.random() * quotaFailMessages.length)];
        const agentMsgId = (Date.now() + 1).toString();
        
        const newAgentMsg: ChatMessage = { 
          id: agentMsgId, 
          role: 'agent', 
          text: failText, 
          timestamp: Date.now(),
          parentId: actualUserMsgId
        };
        
        setMessages(prev => [...prev, newAgentMsg]);
        setActiveMessageId(agentMsgId);

        // Coba play audio untuk pesan error kuota biar makin ngena
        getSpeech(failText, config.voice).then(audio => {
          if (audio) {
            setMessages(prev => prev.map(m => m.id === agentMsgId ? { ...m, audio } : m));
            playAudio(audio);
          }
        });
      }

      setIsTyping(false);
      setLoadingType(null);
    }
  };

  const handleEditSave = (msg: ChatMessage) => {
    if (!editText.trim()) return;
    
    if (msg.role === 'user') {
      handleSend(editText, false, true, msg.parentId);
    } else {
      const newMsgId = Date.now().toString();
      const newMsg: ChatMessage = {
        ...msg,
        id: newMsgId,
        text: editText,
        timestamp: Date.now(),
        audio: undefined 
      };
      setMessages(prev => [...prev, newMsg]);
      setActiveMessageId(newMsgId);
      setEditingId(null);
    }
  };

  const BranchSwitcher: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const siblings = useMemo(() => 
      messages.filter(m => m.parentId === message.parentId && m.role === message.role),
    [message.parentId, message.role, messages]);

    if (siblings.length <= 1) return null;

    const currentIndex = siblings.findIndex(s => s.id === message.id);
    
    const switchToBranch = (id: string) => {
      let deepest = id;
      let next = messages.find(m => m.parentId === deepest);
      while (next) {
        deepest = next.id;
        next = messages.find(m => m.parentId === deepest);
      }
      setActiveMessageId(deepest);
    };

    return (
      <div className={`flex items-center gap-2 mt-2 px-3 py-1 bg-white/5 backdrop-blur-md rounded-full border border-white/10 w-fit animate-in fade-in zoom-in duration-300 ${message.role === 'user' ? '' : 'self-start'}`}>
        <button 
          disabled={currentIndex === 0}
          onClick={() => switchToBranch(siblings[currentIndex - 1].id)}
          className="p-1 hover:bg-white/10 rounded-full disabled:opacity-20 transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-[9px] font-black text-white/40 tracking-widest">{currentIndex + 1} / {siblings.length}</span>
        <button 
          disabled={currentIndex === siblings.length - 1}
          onClick={() => switchToBranch(siblings[currentIndex + 1].id)}
          className="p-1 hover:bg-white/10 rounded-full disabled:opacity-20 transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col p-4 md:p-8 max-w-6xl mx-auto relative overflow-hidden"" onDragOver={e => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}>
      <header className="flex items-center justify-between p-4 rounded-full mb-6 shadow-[0_10px_30px_rgba(0,0,0,0.3)] transition-all duration-300" style={glassStyles}>
        <div className="flex items-center gap-4">
          <button onClick={onOpenSidebar} className="p-3 hover:bg-white/10 rounded-full transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="relative">
            <img src={config.profilePic || ''} className="w-12 h-12 rounded-full object-cover border-2 border-white/20 shadow-md" alt="Avatar" />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-black animate-pulse"></div>
          </div>
          <div>
            <h2 className="font-bold text-lg leading-tight tracking-tight text-white">{config.name}</h2>
            <p className="text-[10px] text-green-400 font-black uppercase tracking-widest">Online</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={onEdit} className="p-3 bg-white/5 hover:bg-white/20 rounded-full transition-all border border-white/10 text-pink-400"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></button>
          <button onClick={onCall} className="px-6 py-3 bg-gradient-to-br from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 rounded-full font-black transition-all text-sm uppercase shadow-lg shadow-pink-500/30 active:scale-95 border border-white/10">Call</button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 px-2 mb-6 scrollbar-hide">
        {activeThread.map((m, idx) => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 duration-300`}>
            <div className={`relative group/bubble max-w-[85%] p-5 shadow-2xl transition-all duration-300 ${m.role === 'user' ? 'bg-pink-500/90 rounded-[30px] rounded-tr-none' : 'rounded-[30px] rounded-tl-none'}`} style={m.role === 'agent' ? glassStyles : {}}>
              
              <button 
                onClick={() => { setEditingId(m.id); setEditText(m.text); }}
                className={`absolute ${m.role === 'user' ? '-left-10' : '-right-10'} top-2 p-2 bg-white/5 hover:bg-white/20 rounded-full text-white/20 hover:text-white opacity-0 group-hover/bubble:opacity-100 transition-all`}
                title="Edit Pesan"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </button>

              {m.image && (
                <div className="mb-4 overflow-hidden rounded-2xl border border-white/10 relative group/img">
                  <img src={m.image} className="w-full max-h-80 object-cover" alt="PAP" />
                  <button 
                    onClick={() => downloadMedia(m.image!, `anya_pap_${m.id}.png`, 'image/png')}
                    className="absolute top-3 right-3 p-2.5 bg-black/60 backdrop-blur-md rounded-xl text-white opacity-0 group-hover/img:opacity-100 transition-all active:scale-90 border border-white/10"
                    title="Download Foto"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0L8 8m4-4v12" /></svg>
                  </button>
                </div>
              )}

              {editingId === m.id ? (
                <div className="space-y-3">
                  <textarea 
                    className="w-full bg-black/20 border border-white/20 rounded-xl p-3 outline-none text-sm text-white resize-none min-h-[100px]"
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditingId(null)} className="text-[10px] font-bold uppercase text-white/40 hover:text-white px-3 py-1">Batal</button>
                    <button onClick={() => handleEditSave(m)} className="text-[10px] font-bold uppercase bg-white text-pink-600 px-3 py-1 rounded-lg">Cabangkan</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium text-white/95">{m.text}</p>
              )}

              {m.role === 'agent' && (
                <div className="flex gap-2 mt-4 flex-wrap items-center">
                  {m.audio && (
                    <>
                      <button onClick={() => playAudio(m.audio!)} className="text-[10px] font-bold uppercase py-2.5 px-5 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10 text-white/80 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>Listen</button>
                      <button onClick={() => downloadMedia(m.audio!, `anya_voice_${m.id}.pcm`, 'audio/pcm')} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-white/40 hover:text-white/80 transition-all border border-white/10" title="Download Audio (PCM)"><svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0L8 8m4-4v12" /></svg></button>
                    </>
                  )}
                  {idx === activeThread.length - 1 && (
                    <button 
                      onClick={() => handleSend(undefined, true)}
                      disabled={isTyping}
                      className="text-[10px] font-bold uppercase py-2.5 px-5 bg-pink-500/20 hover:bg-pink-500/30 rounded-xl transition-all border border-pink-500/20 text-pink-400 flex items-center gap-2 disabled:opacity-50"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className={`h-3.5 w-3.5 ${isTyping ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      Coba Lagi
                    </button>
                  )}
                </div>
              )}
            </div>
            <BranchSwitcher message={m} />
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="rounded-[30px] rounded-tl-none p-5 flex flex-col gap-2 shadow-2xl min-w-[180px]" style={glassStyles}>
              <div className="flex gap-3 items-center">
                <div className="flex gap-2">
                  <div className="w-2.5 h-2.5 bg-pink-500 rounded-full animate-bounce"></div>
                  <div className="w-2.5 h-2.5 bg-pink-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <div className="w-2.5 h-2.5 bg-pink-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                </div>
                <span className="text-xs font-black text-pink-400 italic">{loadingStatus}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="relative flex items-center gap-2 p-1.5 md:p-2 rounded-full shadow-[0_15px_35px_rgba(0,0,0,0.4)] transition-all mb-8 mx-4 group" style={glassStyles}>
        {/* Tombol Lampiran/Image */}
        <label className="p-3 hover:bg-white/10 rounded-full cursor-pointer transition-all active:scale-90 flex items-center justify-center flex-shrink-0">
          <input type="file" className="hidden" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          {attachedImage ? (
        <div className="relative w-6 h-6 rounded-lg overflow-hidden border-2 border-pink-500"><img src={attachedImage} className="w-full h-full object-cover" /></div>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
      )}
        </label>
        {/* Input Teks */}
        <input 
          type="text" 
          placeholder={`Ngobrol sama ${config.name}...`} 
          className="flex-1 bg-transparent outline-none py-3 text-sm font-semibold text-white placeholder:text-white/20 min-w-0" 
          value={inputText} 
          onChange={e => setInputText(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && handleSend()} 
          />
        {/* Tombol Kirim (Bagian yang diperbaiki) */}
        <button 
          onClick={() => handleSend()} 
          disabled={(!inputText.trim() && !attachedImage) || isTyping} 
          className="w-11 h-11 flex-shrink-0 bg-gradient-to-br from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 rounded-full transition-all active:scale-95 disabled:opacity-20 shadow-lg shadow-pink-500/20 border border-white/10 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white translate-x-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
          </svg>
        </button>
      </footer>
    </div>
  );
};

export default ChatView;
