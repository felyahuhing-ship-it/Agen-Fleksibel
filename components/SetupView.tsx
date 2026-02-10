
import React, { useState, useRef } from 'react';
import { AgentConfig } from '../types';

interface SetupViewProps {
  config: AgentConfig;
  setConfig: (config: AgentConfig) => void;
  onStart: () => void;
  onReset: () => void;
  onClose?: () => void;
}

const SetupView: React.FC<SetupViewProps> = ({ config, setConfig, onStart, onReset, onClose }) => {
  const [isDragging, setIsDragging] = useState(false);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => setConfig({ ...config, profilePic: reader.result as string });
      reader.readAsDataURL(file);
    }
  };

  const handleBgFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => setConfig({ ...config, background: reader.result as string });
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const bgOptions = [
    { id: 12, url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=600' }, // Tadinya urutan ke-3, sekarang urutan ke-1
    { id: 10, url: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?q=80&w=600' },
    { id: 11, url: 'https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=600' },
    { id: 13, url: 'https://images.unsplash.com/photo-1501691223387-dd0500403074?q=80&w=600' }
  ];

  // Cek apakah background saat ini adalah background custom (tidak ada di list preset)
  const isCustomBg = config.background.startsWith('data:') || !bgOptions.some(opt => opt.url === config.background);

  const glassOpacity = Math.max(0.1, config.transparency / 100);

  return (
    <div className="w-[95%] max-w-4xl p-1 shadow-2xl animate-in fade-in zoom-in duration-500 overflow-y-auto max-h-[95vh] custom-scrollbar my-4 relative">
      <div 
        className="border border-white/20 rounded-[50px] p-6 md:p-10 shadow-2xl transition-all duration-300 relative"
        style={{ 
          backgroundColor: `rgba(0, 0, 0, ${glassOpacity})`,
          backdropFilter: `blur(${config.blur}px)`,
          WebkitBackdropFilter: `blur(${config.blur}px)`
        }}
      >
        {onClose && (
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 md:top-10 md:right-10 p-3 bg-white/5 hover:bg-white/10 rounded-full transition-all border border-white/10 text-white/40 hover:text-white group z-20"
            title="Tutup Pengaturan"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        <header className="text-center mb-10">
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white drop-shadow-lg break-words px-4">
            {config.name || 'Agent'} Setup
          </h1>
          <p className="text-pink-500 font-bold uppercase text-[10px] tracking-[0.4em] mt-3 opacity-80">Konfigurasi AI Voice Agent</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="space-y-6">
            <div className="flex items-center gap-3 px-2">
              <div className="w-1.5 h-5 bg-pink-500 rounded-full shadow-[0_0_10px_rgba(236,72,153,0.5)]"></div>
              <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/90">Pengaturan Agen</h2>
            </div>
            
            <div className="bg-white/5 border border-white/10 p-6 md:p-8 rounded-[40px] space-y-6 shadow-inner">
              <div className="flex justify-center mb-2">
                <div 
                  className={`relative group p-2 rounded-[50px] transition-all duration-300 ${isDragging ? 'scale-110' : ''}`}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                >
                  <div className={`w-32 h-32 md:w-36 md:h-36 rounded-[45px] overflow-hidden border-4 shadow-2xl bg-black/20 transition-all duration-500 ${isDragging ? 'border-pink-500 shadow-[0_0_30px_rgba(236,72,153,0.5)]' : 'border-white/20 group-hover:border-pink-500/50'}`}>
                    {config.profilePic ? (
                      <img src={config.profilePic} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-pink-500/30">
                        <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      </div>
                    )}
                    {isDragging && (
                      <div className="absolute inset-0 bg-pink-500/20 backdrop-blur-sm flex items-center justify-center text-white font-black text-[10px] uppercase tracking-widest text-center px-4">
                        Lepas untuk Ganti Foto
                      </div>
                    )}
                  </div>
                  <label className="absolute -bottom-1 -right-1 bg-pink-500 p-3 rounded-2xl cursor-pointer hover:scale-110 active:scale-95 transition-all shadow-xl border-2 border-black/20 z-10">
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-white/30 uppercase tracking-widest ml-4">Nama Agen</label>
                  <input 
                    type="text" 
                    className="w-full bg-black/30 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:ring-2 ring-pink-500/40 font-bold transition-all text-white placeholder:text-white/10" 
                    value={config.name} 
                    onChange={(e) => setConfig({ ...config, name: e.target.value })} 
                    placeholder="Nama Panggilan" 
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-white/30 uppercase tracking-widest ml-4">Suara Agen</label>
                  <select 
                    className="w-full bg-black/30 border border-white/10 rounded-2xl px-6 py-4 outline-none font-bold cursor-pointer hover:bg-black/50 transition-all text-white appearance-none" 
                    value={config.voice} 
                    onChange={(e) => setConfig({ ...config, voice: e.target.value })}
                  >
                    <option value="Kore">Suara Ceria (Kore)</option>
                    <option value="Puck">Suara Deep (Puck)</option>
                    <option value="Charon">Suara Elegan (Charon)</option>
                    <option value="Zephyr">Suara Ramah (Zephyr)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-white/30 uppercase tracking-widest ml-4">Kepribadian (Personality)</label>
                  <textarea 
                    className="w-full h-32 bg-black/30 border border-white/10 rounded-[30px] px-6 py-4 outline-none focus:ring-2 ring-pink-500/40 resize-none text-sm font-medium leading-relaxed custom-scrollbar text-white/80" 
                    value={config.personality} 
                    onChange={(e) => setConfig({ ...config, personality: e.target.value })}
                    placeholder="Contoh: Gue asik, suka gibah, ramah..."
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6">
             <div className="flex items-center gap-3 px-2">
              <div className="w-1.5 h-5 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
              <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/90">Visual & Tampilan</h2>
            </div>

            <div className="bg-white/5 border border-white/10 p-6 md:p-8 rounded-[40px] space-y-8 shadow-inner">
              <div className="space-y-4">
                <label className="text-[9px] font-bold text-white/30 uppercase tracking-widest ml-4">Pilih Latar Belakang</label>
                <div className="flex gap-4 overflow-x-auto pb-4 px-2 custom-scrollbar">
                  
                  {/* Preset Backgrounds */}
                  {bgOptions.map(bg => (
                    <button 
                      key={bg.id} 
                      onClick={() => setConfig({...config, background: bg.url})} 
                      className={`flex-shrink-0 w-24 h-24 rounded-2xl border-4 transition-all duration-500 relative overflow-hidden ${config.background === bg.url ? 'border-pink-500 scale-105 shadow-xl shadow-pink-500/20' : 'border-white/5 opacity-50 hover:opacity-100'}`}
                    >
                      <img src={bg.url} className="w-full h-full object-cover" />
                      {config.background === bg.url && <div className="absolute inset-0 bg-pink-500/10 pointer-events-none" />}
                    </button>
                  ))}

                  {/* Tombol Upload Custom - TETAP DI URUTAN TERAKHIR */}
                  <div className="flex-shrink-0">
                    <input type="file" className="hidden" accept="image/*" ref={bgInputRef} onChange={handleBgFile} />
                    <button 
                      onClick={() => bgInputRef.current?.click()}
                      className={`w-24 h-24 rounded-2xl border-4 border-dashed transition-all flex flex-col items-center justify-center gap-1 group/upload ${isCustomBg ? 'border-pink-500 bg-pink-500/10' : 'border-white/10 bg-white/5 hover:border-pink-500/40'}`}
                    >
                      {isCustomBg ? (
                        <div className="relative w-full h-full">
                          <img src={config.background} className="w-full h-full object-cover rounded-xl" />
                          <div className="absolute inset-0 bg-pink-500/40 flex items-center justify-center">
                            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                          </div>
                        </div>
                      ) : (
                        <>
                          <svg className="h-6 w-6 text-white/20 group-hover/upload:text-pink-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                          <span className="text-[8px] font-black uppercase text-white/20 group-hover/upload:text-pink-500 tracking-widest">Custom</span>
                        </>
                      )}
                    </button>
                  </div>

                </div>
              </div>

              <div className="space-y-8 px-2">
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Intensitas Blur</label>
                    <span className="text-xs font-black text-pink-500 bg-pink-500/10 px-3 py-1 rounded-full">{config.blur}px</span>
                  </div>
                  <input 
                    type="range" min="0" max="40" 
                    className="w-full accent-pink-500 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer hover:bg-white/20 transition-all"
                    value={config.blur} 
                    onChange={(e) => setConfig({...config, blur: parseInt(e.target.value)})}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Kecerahan (Kegelapan)</label>
                    <span className="text-xs font-black text-pink-500 bg-pink-500/10 px-3 py-1 rounded-full">{config.transparency}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="100" 
                    className="w-full accent-pink-500 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer hover:bg-white/20 transition-all"
                    value={config.transparency} 
                    onChange={(e) => setConfig({...config, transparency: parseInt(e.target.value)})}
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 space-y-4">
               <button 
                onClick={onStart} 
                className="w-full bg-gradient-to-r from-pink-600 via-purple-600 to-pink-600 bg-[length:200%_auto] animate-gradient hover:bg-right text-white font-black py-6 rounded-[30px] shadow-2xl shadow-pink-500/20 active:scale-[0.98] transition-all uppercase tracking-[0.4em] text-[13px] border border-white/20"
              >
                Aktifkan Bestie AI
              </button>
              <button 
                onClick={onReset} 
                className="w-full text-[9px] font-bold uppercase tracking-[0.2em] text-white/20 hover:text-red-400 transition-colors py-2"
              >
                Hapus & Reset Semua Memori
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default SetupView;
