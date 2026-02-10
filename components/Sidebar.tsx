
import React from 'react';
import { ChatMessage, CallHistory, ChatSession } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  sessions: ChatSession[];
  history: CallHistory[];
  onNewChat: () => void;
  onLoadSession: (session: ChatSession) => void;
  onDeleteSession: (id: string) => void;
  onClearSessions: () => void;
  onDeleteCall: (id: string) => void;
  onClearCalls: () => void;
  onReset: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, 
  onClose, 
  history, 
  onReset, 
  messages, 
  sessions, 
  onNewChat, 
  onLoadSession, 
  onDeleteSession, 
  onClearSessions,
  onDeleteCall,
  onClearCalls
}) => {
  return (
    <>
      <div 
        className={`fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <aside 
        className={`fixed top-0 left-0 h-full w-[300px] z-[70] glass-dark shadow-2xl transition-transform duration-500 ease-out border-r border-white/10 overflow-hidden flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-6 flex flex-col h-full">
          <header className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-xl font-black tracking-tight text-white">Archives</h1>
              <p className="text-[9px] text-pink-500 font-bold uppercase tracking-widest mt-0.5">Memories</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-all">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
               </svg>
            </button>
          </header>

          <button 
            onClick={onNewChat}
            className="w-full mb-8 bg-gradient-to-r from-pink-500 via-purple-600 to-pink-500 bg-[length:200%_auto] hover:bg-right text-white font-black py-3.5 rounded-2xl shadow-xl shadow-pink-500/20 flex items-center justify-center gap-3 transition-all active:scale-[0.97] border border-white/20 uppercase text-[10px] tracking-widest"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Sesi Baru
          </button>

          <div className="flex-1 overflow-y-auto space-y-10 pr-2 custom-scrollbar">
            {/* SAVED CHATS */}
            <section>
              <div className="flex items-center justify-between mb-4 px-1">
                <label className="text-pink-500 font-bold text-[9px] uppercase tracking-[0.2em]">Chat History</label>
                {(sessions.length > 0 || messages.length > 0) && (
                  <button 
                    type="button"
                    onClick={onClearSessions} 
                    className="relative z-[80] text-[8px] font-bold text-white/20 hover:text-red-400 uppercase tracking-widest transition-colors px-2 py-1"
                  >
                    Hapus Semua
                  </button>
                )}
              </div>
              
              <div className="space-y-3">
                {/* Active Session Preview */}
                {messages.length > 0 && (
                  <div className="p-4 rounded-2xl border border-pink-500/30 bg-pink-500/5 relative overflow-hidden group">
                    <div className="flex gap-3 items-start">
                        <div className="w-8 h-8 bg-pink-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white animate-pulse" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z" clipRule="evenodd" /></svg>
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="text-[8px] font-black uppercase text-pink-400 mb-0.5 tracking-widest">Sesi Aktif</p>
                          <p className="text-xs font-bold truncate text-white/90">
                            {messages[messages.length - 1].text}
                          </p>
                        </div>
                    </div>
                  </div>
                )}

                {sessions.map(session => (
                  <div key={session.id} className="group relative">
                    <button 
                      onClick={() => onLoadSession(session)}
                      className="w-full text-left p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all flex gap-3 items-center group/btn"
                    >
                      <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center flex-shrink-0 text-white/20 group-hover/btn:text-white/60 transition-colors">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                      </div>
                      <div className="flex-1 overflow-hidden pr-6">
                         <p className="text-xs font-bold truncate text-white/60 group-hover/btn:text-white transition-colors">{session.title}</p>
                         <p className="text-[9px] text-white/10 mt-0.5 font-medium">{new Date(session.timestamp).toLocaleDateString()}</p>
                      </div>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-white/0 group-hover:text-red-500/40 hover:text-red-500 transition-all focus:outline-none"
                      title="Hapus Sesi"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* CALL HISTORY */}
            <section>
              <div className="flex items-center justify-between mb-4 px-1">
                <label className="text-pink-500 font-bold text-[9px] uppercase tracking-[0.2em]">Panggilan</label>
                {history.length > 0 && (
                  <button 
                    type="button"
                    onClick={onClearCalls} 
                    className="relative z-[80] text-[8px] font-bold text-white/20 hover:text-red-400 uppercase tracking-widest transition-colors px-2 py-1"
                  >
                    Bersihkan
                  </button>
                )}
              </div>
              
              {history.length === 0 ? (
                <div className="bg-white/5 p-4 rounded-2xl text-center border border-white/5 border-dashed">
                  <p className="text-[8px] text-white/20 font-bold uppercase tracking-widest">Kosong</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map(item => (
                    <div key={item.id} className="group bg-white/5 p-3 rounded-2xl border border-white/5 flex items-center justify-between hover:bg-white/10 transition-all">
                       <div className="flex items-center gap-2.5">
                         <div className="w-8 h-8 bg-pink-500/10 rounded-lg flex items-center justify-center text-pink-500 shadow-inner">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                             <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                           </svg>
                         </div>
                         <div>
                           <p className="text-[10px] font-black text-white/80 uppercase tracking-tighter">Finished</p>
                           <p className="text-[8px] text-white/30 font-medium">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {item.duration}</p>
                         </div>
                       </div>
                       <button 
                         onClick={(e) => { e.stopPropagation(); onDeleteCall(item.id); }}
                         className="p-1.5 text-white/0 group-hover:text-red-500/40 hover:text-red-500 transition-all"
                       >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                       </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <footer className="mt-8 pt-4 border-t border-white/5 flex flex-col items-center">
            <button 
              type="button"
              onClick={onReset}
              className="relative z-[80] px-6 py-2 text-[8px] font-black uppercase tracking-[0.4em] text-white/20 hover:text-red-500/60 rounded-xl transition-all"
            >
              Reset Memories
            </button>
            <p className="mt-3 text-[7px] font-bold text-white/10 uppercase tracking-widest text-center">Anya AI v2.5 Stable</p>
          </footer>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
