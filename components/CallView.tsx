
import React, { useState, useEffect, useRef } from 'react';
import { AgentConfig } from '../types';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createSystemInstruction, cleanResponseText } from '../services/geminiService';

interface CallViewProps {
  config: AgentConfig;
  onEndCall: (duration: string) => void;
}

const CallView: React.FC<CallViewProps> = ({ config, onEndCall }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState('CONNECTING...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isQuotaError, setIsQuotaError] = useState(false);
  const [timer, setTimer] = useState(0);
  const [inputText, setInputText] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [transcription, setTranscription] = useState<string>(''); 
  const [agentSpeechText, setAgentSpeechText] = useState<string>(''); 
  const [micActivity, setMicActivity] = useState(0);
  const [agentActivity, setAgentActivity] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  
  const [volume, setVolume] = useState(1.0);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [currentVoice, setCurrentVoice] = useState(config.voice);
  const [networkPing, setNetworkPing] = useState<number>(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const agentAnalyserRef = useRef<AnalyserNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const currentStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setNetworkPing(Math.floor(Math.random() * 50) + 20); 
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        setMics(audioInputs);
        if (audioInputs.length > 0 && !selectedMicId) {
          setSelectedMicId(audioInputs[0].deviceId);
        }
      } catch (e) { console.error(e); }
    };
    getDevices();
  }, []);

  useEffect(() => {
    let isMounted = true;
    let animationId: number;

    const startSession = async () => {
      try {
        setErrorMessage(null);
        setIsQuotaError(false);
        setTranscription('');
        setAgentSpeechText('');
        
        if (sessionRef.current) {
          try { sessionRef.current.close(); } catch(e) {}
          sessionRef.current = null;
        }

        const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
        
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
          gainNodeRef.current = audioContextRef.current.createGain();
          agentAnalyserRef.current = audioContextRef.current.createAnalyser();
          agentAnalyserRef.current.fftSize = 256;
          gainNodeRef.current.connect(agentAnalyserRef.current);
          agentAnalyserRef.current.connect(audioContextRef.current.destination);
        }
        
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }
        
        if (gainNodeRef.current) gainNodeRef.current.gain.value = volume;

        const inputSampleRate = 16000;
        if (inputAudioContextRef.current) {
          await inputAudioContextRef.current.close();
        }
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: inputSampleRate });

        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { deviceId: selectedMicId ? { exact: selectedMicId } : undefined } 
        });
        
        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        
        currentStreamRef.current = stream;

        micAnalyserRef.current = inputAudioContextRef.current.createAnalyser();
        const sourceNode = inputAudioContextRef.current.createMediaStreamSource(stream);
        sourceNode.connect(micAnalyserRef.current);
        micAnalyserRef.current.fftSize = 256;
        
        const micDataArray = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
        const agentDataArray = new Uint8Array(agentAnalyserRef.current!.frequencyBinCount);

        const updateActivity = () => {
          if (!isMounted) return;
          if (micAnalyserRef.current) {
            micAnalyserRef.current.getByteFrequencyData(micDataArray);
            const micAvg = micDataArray.reduce((a, b) => a + b, 0) / micDataArray.length;
            setMicActivity(isMuted ? 0 : micAvg);
          }
          if (agentAnalyserRef.current) {
            agentAnalyserRef.current.getByteFrequencyData(agentDataArray);
            const agentAvg = agentDataArray.reduce((a, b) => a + b, 0) / agentDataArray.length;
            setAgentActivity(agentAvg);
          }
          animationId = requestAnimationFrame(updateActivity);
        };
        updateActivity();

        const fullInstruction = `
          ${createSystemInstruction(config)}
          ATURAN LIVE CALL:
          - HANYA keluarkan kalimat yang akan diucapkan. JANGAN ada penjelasan strategi atau status mode dalam Bahasa Inggris.
          - Jika user menyela, segera berhenti bicara.
          - Fokus bicara dalam Bahasa Indonesia Jakarta Slang yang asik.
        `;

        sessionPromiseRef.current = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          callbacks: {
            onopen: () => {
              if (!isMounted) return;
              setStatus('LISTENING...');
              const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
              const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
              scriptProcessor.onaudioprocess = (e) => {
                if (isMuted || !isMounted) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData, inputSampleRate);
                sessionPromiseRef.current?.then(session => {
                  session.sendRealtimeInput({ media: pcmBlob });
                }).catch(() => {});
              };
              source.connect(scriptProcessor);
              scriptProcessor.connect(inputAudioContextRef.current!.destination);
            },
            onmessage: async (message: LiveServerMessage) => {
              if (!isMounted) return;

              // Gunakan Output Transcription untuk tampilan teks karena lebih bersih dari meta-talk
              if (message.serverContent?.outputTranscription) {
                const text = message.serverContent.outputTranscription.text;
                setAgentSpeechText(prev => (prev + text).trim());
              }

              if (message.serverContent?.inputTranscription) {
                setTranscription(prev => (prev + " " + message.serverContent?.inputTranscription?.text).trim());
              }

              const parts = message.serverContent?.modelTurn?.parts || [];
              for (const part of parts) {
                if (part.inlineData?.data) {
                  setStatus('SPEAKING...');
                  const base64Audio = part.inlineData.data;
                  const ctx = audioContextRef.current!;
                  nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                  
                  try {
                    const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                    const source = ctx.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(gainNodeRef.current || ctx.destination);
                    source.addEventListener('ended', () => {
                      sourcesRef.current.delete(source);
                      if (sourcesRef.current.size === 0) {
                        setStatus('LISTENING...');
                        // Jangan langsung hapus teks agar user bisa baca sebentar
                        setTimeout(() => {
                           if (sourcesRef.current.size === 0) setAgentSpeechText('');
                        }, 2000);
                      }
                    });
                    source.start(nextStartTimeRef.current);
                    nextStartTimeRef.current += audioBuffer.duration;
                    sourcesRef.current.add(source);
                  } catch (e) {
                    console.error("Audio Decode Error:", e);
                  }
                }
              }

              if (message.serverContent?.interrupted) {
                sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
                setAgentSpeechText('');
                setAgentActivity(0);
              }
              if (message.serverContent?.turnComplete) setTranscription('');
            },
            onerror: (e: any) => { 
              if (!isMounted) return;
              const msg = e.message || e.reason || "";
              if (msg.includes('429')) {
                setIsQuotaError(true);
                setStatus('QUOTA EXHAUSTED');
                setErrorMessage('Kuota Gratisan Habis (Error 429). Tunggu 1 menit.');
              } else {
                setStatus('ERROR');
                setErrorMessage('Koneksi terganggu.');
              }
            },
            onclose: (e: any) => { 
              if (!isMounted) return;
              if (e.code === 1006) {
                 setStatus('OFFLINE');
                 setErrorMessage('Koneksi terputus mendadak.');
              }
            }
          },
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: currentVoice } }
            },
            systemInstruction: fullInstruction
          }
        });
        sessionRef.current = await sessionPromiseRef.current;
      } catch (err: any) {
        if (isMounted) {
           const msg = err.message || "";
           setStatus('ERROR');
           setErrorMessage(msg.includes('429') ? 'Kuota Habis.' : 'Gagal menyambung.');
        }
      }
    };

    startSession();

    return () => {
      isMounted = false;
      cancelAnimationFrame(animationId);
      if (sessionRef.current) {
        try { sessionRef.current.close(); } catch(e) {}
      }
      if (currentStreamRef.current) currentStreamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [selectedMicId, currentVoice, retryCount]);

  useEffect(() => {
    const interval = setInterval(() => setTimer(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSendText = () => {
    if (!inputText.trim() || !sessionRef.current) return;
    if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume();
    setAgentSpeechText('');
    setStatus('AGENT THINKING...');
    sessionRef.current.sendRealtimeInput({ text: inputText });
    setInputText('');
  };

  const handleReconnect = () => {
    setStatus('RECONNECTING...');
    setRetryCount(prev => prev + 1);
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const decode = (base64: string) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };

  const encode = (bytes: Uint8Array) => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) => {
    const alignedBuffer = data.byteOffset % 2 === 0 
      ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      : new Uint8Array(data).buffer;

    const dataInt16 = new Int16Array(alignedBuffer);
    const frameCount = Math.floor(dataInt16.length / numChannels);
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let ch = 0; ch < numChannels; ch++) {
      const chData = buffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) chData[i] = dataInt16[i * numChannels + ch] / 32768.0;
    }
    return buffer;
  };

  const createBlob = (data: Float32Array, sampleRate: number) => {
    const int16 = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) int16[i] = data[i] * 32768;
    return { data: encode(new Uint8Array(int16.buffer)), mimeType: `audio/pcm;rate=${sampleRate}` };
  };

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col items-center justify-between py-4 md:py-6 px-4 md:px-12 text-white animate-in fade-in duration-700 overflow-hidden h-[100dvh]">
      <div 
        className="absolute inset-0 z-[-1] bg-cover bg-center transition-all duration-1000 scale-105"
        style={{ 
          backgroundImage: `url(${config.profilePic || ''})`,
          filter: 'blur(100px) brightness(0.15) saturate(1.2)' 
        }}
      />

      <div className="absolute top-4 right-4 md:top-6 md:right-8 flex flex-col items-end gap-2 z-30">
        <div className="flex items-center gap-2 bg-white/5 backdrop-blur-3xl px-3 py-1.5 rounded-full border border-white/10 shadow-xl">
          <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_8px] ${networkPing < 100 ? 'bg-green-500 shadow-green-500/50' : 'bg-yellow-500 shadow-yellow-500/50'}`}></div>
          <span className="text-[9px] md:text-[10px] font-bold text-white/40 tracking-tight">{networkPing}ms</span>
        </div>
        {(isQuotaError || errorMessage?.includes('1006')) && (
          <button 
            onClick={() => (window as any).aistudio?.openSelectKey()}
            className="bg-orange-500 hover:bg-orange-600 backdrop-blur-md text-[9px] font-black uppercase px-4 py-2 rounded-full shadow-[0_10px_30px_rgba(249,115,22,0.3)] animate-bounce border border-white/20 transition-all active:scale-95"
          >
            Ganti API Key
          </button>
        )}
      </div>

      <div className="text-center w-full max-w-screen-lg relative z-20 flex flex-col items-center gap-1 shrink-0">
        <div className="flex items-center justify-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse shadow-[0_0_8px] ${status.includes('ERROR') || status.includes('LIMIT') || status.includes('OFFLINE') ? 'bg-red-500 shadow-red-500/50' : 'bg-green-500 shadow-green-500/50'}`}></div>
          <p className="text-[9px] md:text-xs font-black tracking-[0.2em] opacity-40 uppercase">
            Live Session • {formatTime(timer)}
          </p>
        </div>
        <h1 className="text-2xl md:text-4xl font-black tracking-tighter truncate max-w-[95%] mx-auto drop-shadow-xl transition-all">
          {config.name}
        </h1>
        <div className="flex flex-col items-center gap-1.5">
          <p className={`font-black px-4 py-1 rounded-full text-[9px] md:text-xs border backdrop-blur-3xl shadow-xl transition-all duration-500 ${isQuotaError ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' : 'text-pink-400 bg-pink-500/10 border-pink-500/20'}`}>
            {status}
          </p>
          {errorMessage && (
            <div className="flex flex-col items-center gap-1.5 animate-in slide-in-from-top-1">
              <p className="text-[9px] md:text-xs text-white font-bold bg-red-500/60 backdrop-blur-lg px-4 py-1 rounded-full uppercase text-center max-w-sm shadow-xl border border-white/10">{errorMessage}</p>
              {!isQuotaError && (
                <button 
                  onClick={handleReconnect}
                  className="bg-white/5 hover:bg-white/10 px-3 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border border-white/10 transition-all active:scale-95"
                >
                  Reconnect
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="w-full max-w-screen-lg flex flex-col lg:grid lg:grid-cols-2 items-center lg:justify-items-center justify-center gap-6 md:gap-8 my-auto z-10 overflow-hidden shrink min-h-0 px-4">
        
        <div className="relative group shrink-0 lg:order-1">
          <div 
            className="absolute inset-[-20px] md:inset-[-35px] rounded-full border-[6px] border-pink-500/30 transition-all duration-150"
            style={{ 
              transform: `scale(${1 + agentActivity/50})`,
              opacity: agentActivity/150,
              filter: `blur(${agentActivity/5}px)`,
              boxShadow: `0 0 ${agentActivity}px rgba(236,72,153,0.5)`
            }}
          ></div>
          
          <div 
            className="absolute inset-[-15px] md:inset-[-25px] rounded-full border-[2px] border-green-500/30 transition-all duration-150"
            style={{ 
              transform: `scale(${1 + micActivity/70})`,
              opacity: micActivity/120,
              boxShadow: `0 0 ${micActivity/1.5}px rgba(34,197,94,0.4)`
            }}
          ></div>

          <div className={`relative w-28 h-28 sm:w-36 sm:h-36 md:w-48 md:h-48 lg:w-56 lg:h-56 rounded-[30px] sm:rounded-[40px] md:rounded-[50px] overflow-hidden border-2 md:border-4 shadow-[0_15px_45px_rgba(0,0,0,0.6)] transition-all duration-500 ${isQuotaError ? 'border-orange-500/40 grayscale' : agentActivity > 5 ? 'border-pink-500/60 scale-[1.02]' : micActivity > 5 ? 'border-green-500/60' : 'border-white/10'}`}>
            <img src={config.profilePic || ''} className="w-full h-full object-cover transition-transform duration-[4s] hover:scale-105" alt="Profile" />
            <div className={`absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent transition-opacity duration-500 ${agentActivity > 10 ? 'opacity-0' : 'opacity-100'}`} />
          </div>
        </div>

        <div className="w-full lg:order-2 flex flex-col gap-3 items-center lg:items-start max-w-lg">
          <div className="w-full bg-white/5 backdrop-blur-3xl rounded-[25px] md:rounded-[35px] border border-white/10 p-4 md:p-6 transition-all shadow-[0_10px_40px_rgba(0,0,0,0.3)] min-h-[80px] md:min-h-[100px] flex items-center justify-center overflow-y-auto custom-scrollbar">
             {agentSpeechText ? (
               <p className="text-center lg:text-left text-sm md:text-lg lg:text-xl font-bold text-white leading-tight animate-in fade-in slide-in-from-bottom-2 duration-500">
                  "{agentSpeechText}"
               </p>
             ) : (
               <p className="text-center lg:text-left text-[10px] md:text-sm font-medium text-white/30 italic tracking-wide">
                 {transcription || (isMuted ? "Mikrofon mati" : isQuotaError ? "Kuota Limit." : "Dengerin lo...")}
               </p>
             )}
          </div>
          
          <div className="hidden lg:flex w-full h-1 bg-white/5 rounded-full overflow-hidden">
             <div 
               className="h-full bg-pink-500 transition-all duration-100 ease-out shadow-[0_0_8px_rgba(236,72,153,0.4)]" 
               style={{ width: `${Math.min(100, agentActivity * 1.5)}%` }}
             />
          </div>
        </div>
      </div>

      <div className="w-full max-w-screen-md flex flex-col items-center gap-4 md:gap-6 z-20 shrink-0 pb-2">
        <div className="flex items-center gap-4 md:gap-5">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className={`p-4 md:p-5 rounded-[20px] md:rounded-[30px] transition-all border border-white/10 active:scale-90 group ${isMuted ? 'bg-red-500 text-white shadow-xl shadow-red-500/30' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {isMuted ? (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 3l18 18" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6M17 16.95A7 7 0 015 11M12 18v4M8 22h8" />
                </>
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              )}
            </svg>
          </button>
          
          <button 
            onClick={() => onEndCall(formatTime(timer))}
            className="p-6 md:p-8 bg-red-600 hover:bg-red-500 rounded-full shadow-[0_12px_40px_rgba(220,38,38,0.4)] transition-all hover:scale-105 active:scale-95 text-white border-2 md:border-4 border-white/5 flex items-center justify-center group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 md:h-8 md:w-8 rotate-[135deg]" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
            </svg>
          </button>

          <button 
            onClick={() => setShowSettings(true)}
            className="p-4 md:p-5 bg-white/5 hover:bg-white/10 rounded-[20px] md:rounded-[30px] text-white/50 hover:text-white transition-all border border-white/10 group active:scale-90"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transition-transform group-hover:rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        <div className="w-full flex items-center gap-3 bg-white/5 border border-white/10 rounded-[25px] md:rounded-[40px] p-1.5 pl-4 md:pl-5 focus-within:ring-2 ring-pink-500/40 transition-all shadow-xl backdrop-blur-3xl group/input">
          <input 
            type="text" 
            placeholder="Bisikin sesuatu..." 
            className="flex-1 bg-transparent outline-none py-2 md:py-3 text-xs md:text-sm font-bold text-white placeholder:text-white/20"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
            disabled={isQuotaError}
          />
          <button 
            onClick={handleSendText}
            disabled={!inputText.trim() || status === 'AGENT THINKING...' || isQuotaError}
            className="p-3 md:p-3.5 bg-gradient-to-br from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 rounded-full text-white transition-all disabled:opacity-20 active:scale-90 shadow-lg shadow-pink-500/20 group-hover/input:scale-105"
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5 rotate-90" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={() => setShowSettings(false)} />
           <div className="relative w-full max-w-sm bg-zinc-900/90 border border-white/10 rounded-[30px] md:rounded-[40px] p-6 md:p-8 shadow-2xl backdrop-blur-3xl max-h-[90dvh] overflow-y-auto custom-scrollbar">
              <header className="flex justify-between items-center mb-6">
                 <h3 className="text-base md:text-lg font-black uppercase tracking-[0.2em] text-pink-500">Config</h3>
                 <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-white/5 rounded-full text-white/40 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                 </button>
              </header>

              <div className="space-y-5">
                <div className="space-y-2">
                   <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em] ml-2">Suara Agen</label>
                   <div className="relative">
                      <select 
                         className="w-full bg-black border border-white/10 rounded-xl md:rounded-2xl px-4 py-3.5 md:py-4 font-bold text-xs md:text-sm text-white outline-none cursor-pointer appearance-none pr-10 hover:border-pink-500/40 transition-colors"
                         value={currentVoice}
                         onChange={(e) => setCurrentVoice(e.target.value)}
                      >
                         <option value="Kore" className="bg-zinc-900">Suara Ceria (Kore)</option>
                         <option value="Puck" className="bg-zinc-900">Suara Deep (Puck)</option>
                         <option value="Charon" className="bg-zinc-900">Suara Elegan (Charon)</option>
                         <option value="Zephyr" className="bg-zinc-900">Suara Ramah (Zephyr)</option>
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                   </div>
                </div>

                <div className="space-y-2">
                   <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em] ml-2">Mic</label>
                   <div className="relative">
                      <select 
                         className="w-full bg-black border border-white/10 rounded-xl md:rounded-2xl px-4 py-3.5 md:py-4 font-bold text-xs md:text-sm text-white outline-none cursor-pointer appearance-none pr-10 hover:border-pink-500/40 transition-colors"
                         value={selectedMicId}
                         onChange={(e) => setSelectedMicId(e.target.value)}
                      >
                         {mics.length > 0 ? mics.map(mic => (
                           <option key={mic.deviceId} value={mic.deviceId} className="bg-zinc-900">{mic.label || `Mic ${mic.deviceId.substring(0, 5)}`}</option>
                         )) : (
                           <option value="" className="bg-zinc-900">Tidak ada mikrofon terdeteksi</option>
                         )}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                   </div>
                </div>

                <div className="space-y-3 px-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em]">Volume</label>
                    <span className="text-xs font-black text-pink-500">{Math.round(volume * 100)}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="1.5" step="0.05"
                    className="w-full accent-pink-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                    value={volume} 
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                  />
                </div>
              </div>

              <button 
                onClick={() => setShowSettings(false)}
                className="w-full mt-8 bg-gradient-to-r from-pink-500 via-purple-600 to-pink-500 bg-[length:200%_auto] hover:bg-right text-white font-black py-4 md:py-5 rounded-[20px] md:rounded-[30px] uppercase text-[10px] tracking-[0.4em] shadow-xl hover:scale-[1.02] active:scale-95 transition-all border border-white/10"
              >
                Simpan
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

export default CallView;
