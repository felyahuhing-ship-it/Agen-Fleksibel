
import React, { useState, useEffect, useMemo } from 'react';
import { AgentConfig, AppState, ChatMessage, CallHistory, ChatSession } from './types';
import SetupView from './components/SetupView';
import ChatView from './components/ChatView';
import CallView from './components/CallView';
import Sidebar from './components/Sidebar';

const ANYA_DEFAULT_PIC = 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&q=80&w=600';
// Mengatur background urutan ke-3 sebagai default
const DEFAULT_BG = 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=600';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.SETUP);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [callHistory, setCallHistory] = useState<CallHistory[]>([]);

  const [config, setConfig] = useState<AgentConfig>({
    name: 'Anya',
    personality: 'Gue bestie lo yang paling asik, santai, tapi perhatian banget. Gaya ngomong gue Jakarta banget (Gue/Lo). Seru diajak ngobrol apa aja deh!',
    voice: 'Kore',
    profilePic: ANYA_DEFAULT_PIC,
    background: DEFAULT_BG,
    blur: 15,
    transparency: 40
  });

  const activeThread = useMemo(() => {
    if (!activeMessageId) return [];
    const thread: ChatMessage[] = [];
    let currentId: string | null | undefined = activeMessageId;
    
    while (currentId) {
      const msg = messages.find(m => m.id === currentId);
      if (msg) {
        thread.unshift(msg);
        currentId = msg.parentId;
      } else {
        currentId = null;
      }
    }
    return thread;
  }, [activeMessageId, messages]);

  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem('anya_config');
      if (savedConfig) setConfig(JSON.parse(savedConfig));
      
      const savedMessages = localStorage.getItem('anya_messages');
      if (savedMessages) setMessages(JSON.parse(savedMessages));
      
      const savedActiveId = localStorage.getItem('anya_active_id');
      if (savedActiveId) setActiveMessageId(savedActiveId);

      const savedSessions = localStorage.getItem('anya_sessions');
      if (savedSessions) setSessions(JSON.parse(savedSessions));
      
      const savedHistory = localStorage.getItem('anya_history');
      if (savedHistory) setCallHistory(JSON.parse(savedHistory));

      if (savedMessages && JSON.parse(savedMessages).length > 0) {
        setAppState(AppState.CHAT);
      }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => localStorage.setItem('anya_config', JSON.stringify(config)), [config]);
  useEffect(() => localStorage.setItem('anya_messages', JSON.stringify(messages)), [messages]);
  useEffect(() => localStorage.setItem('anya_active_id', activeMessageId || ''), [activeMessageId]);
  useEffect(() => localStorage.setItem('anya_sessions', JSON.stringify(sessions)), [sessions]);
  useEffect(() => localStorage.setItem('anya_history', JSON.stringify(callHistory)), [callHistory]);

  const archiveCurrentSession = () => {
    if (messages.length > 0) {
      const firstMsg = messages.find(m => !m.parentId);
      const title = firstMsg ? (firstMsg.text.substring(0, 35) + (firstMsg.text.length > 35 ? '...' : '')) : "Obrolan Tanpa Judul";
      const newSession: ChatSession = {
        id: Date.now().toString(),
        title,
        messages: [...messages],
        activeMessageId: activeMessageId,
        timestamp: Date.now()
      };
      setSessions(prev => [newSession, ...prev]);
    }
  };

  const startNewChat = () => {
    archiveCurrentSession();
    setMessages([]);
    setActiveMessageId(null);
    setIsSidebarOpen(false);
  };

  const loadSession = (session: ChatSession) => {
    archiveCurrentSession(); 
    setMessages(session.messages);
    setActiveMessageId(session.activeMessageId);
    setSessions(prev => prev.filter(s => s.id !== session.id));
    setIsSidebarOpen(false);
  };

  const deleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  const clearAllSessions = () => {
    localStorage.removeItem('anya_messages');
    localStorage.removeItem('anya_active_id');
    localStorage.removeItem('anya_sessions');
    
    setMessages([]);
    setActiveMessageId(null);
    setSessions([]);
    setIsSidebarOpen(false);
    setAppState(AppState.SETUP);
  };

  const deleteCall = (id: string) => {
    setCallHistory(prev => prev.filter(c => c.id !== id));
  };

  const clearAllCalls = () => {
    localStorage.removeItem('anya_history');
    setCallHistory([]);
  };

  const resetAll = () => {
    localStorage.clear();
    window.location.reload();
  };

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden flex flex-col items-center justify-center">
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-500"
        style={{ backgroundImage: `url(${config.background})` }}
      >
        <div className="absolute inset-0 bg-black" style={{ opacity: config.transparency / 100 }} />
        <div className="absolute inset-0 backdrop-blur-md" style={{ backdropFilter: `blur(${config.blur}px)` }} />
      </div>

      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        messages={activeThread}
        sessions={sessions}
        history={callHistory}
        onNewChat={startNewChat}
        onLoadSession={loadSession}
        onDeleteSession={deleteSession}
        onClearSessions={clearAllSessions}
        onDeleteCall={deleteCall}
        onClearCalls={clearAllCalls}
        onReset={resetAll}
      />

      <main className="relative z-10 w-full h-full flex flex-col items-center justify-center overflow-hidden">
        {appState === AppState.SETUP && (
          <SetupView 
            config={config} 
            setConfig={setConfig} 
            onStart={() => setAppState(AppState.CHAT)} 
            onReset={resetAll} 
            onClose={messages.length > 0 ? () => setAppState(AppState.CHAT) : undefined}
          />
        )}
        {appState === AppState.CHAT && (
          <ChatView 
            config={config} 
            messages={messages}
            setMessages={setMessages}
            activeMessageId={activeMessageId}
            setActiveMessageId={setActiveMessageId}
            activeThread={activeThread}
            onOpenSidebar={() => setIsSidebarOpen(true)}
            onCall={() => setAppState(AppState.CALL)}
            onEdit={() => setAppState(AppState.SETUP)}
          />
        )}
        {appState === AppState.CALL && (
          <CallView 
            config={config}
            onEndCall={(duration) => {
              if (duration !== "0:00") {
                setCallHistory(prev => [{ id: Date.now().toString(), timestamp: Date.now(), duration, status: 'completed' }, ...prev]);
              }
              setAppState(AppState.CHAT);
            }}
          />
        )}
      </main>
    </div>
  );
};

export default App;
