import React, { useState, useEffect, useMemo } from 'react';
import LogoImg from './assets/logo.svg';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { 
  getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, 
  deleteDoc, query, setDoc, serverTimestamp 
} from 'firebase/firestore';
import { 
  Plus, Home, Share2, Puzzle, Link as LinkIcon, Globe, MoreHorizontal, 
  BookOpen, Rocket, HelpCircle, Settings, ChevronRight, BarChart3, 
  ArrowRight, Users, CreditCard, Layers, Variable, FileText, Play,
  Calendar, Award, Target, Info, AlertCircle, TrendingUp, Clock,
  MessageSquare, Sparkles, ShieldCheck
  , Trash2
} from 'lucide-react';
import { getSchools, createSchool as apiCreateSchool, deleteSchool as apiDeleteSchool } from './api/schools';

// --- FIREBASE CONFIGURATION (safe fallback) ---
let firebaseConfig = null;
try {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    firebaseConfig = JSON.parse(__firebase_config);
  }
} catch (err) {
  console.warn('Could not parse __firebase_config, falling back to local mock:', err);
}

const hasFirebase = !!firebaseConfig;
const app = hasFirebase ? initializeApp(firebaseConfig) : null;
const auth = hasFirebase ? getAuth(app) : null;
const db = hasFirebase ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'common-app-v1';

// --- MAIN APPLICATION ---
const App = () => {
  const [user, setUser] = useState(null);
  const [schools, setSchools] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const API_BASE = (import.meta && import.meta.env && import.meta.env.VITE_API_BASE) ? import.meta.env.VITE_API_BASE : 'http://localhost:4000';

  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchProvider, setSearchProvider] = useState('local');
  const [providerError, setProviderError] = useState(null);
  const searchTimer = React.useRef(null);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentReply, setAgentReply] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('Overview');
  const [activeNav, setActiveNav] = useState('home');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryResults, setLibraryResults] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const libraryTimer = React.useRef(null);
  const [studentProfile, setStudentProfile] = useState({
    sat: 1420,
    act: 32,
    gpa: 3.9
  });

  // Sidebar animation / expansion state
  const [navExpanded, setNavExpanded] = useState(false);
  const [navAnim, setNavAnim] = useState(true);

  useEffect(() => {
    // keep navAnim true for the duration of the nav expand animation + small buffer
    const ANIM_MS = 1400; // should match CSS (~1200ms) + buffer for smooth 'spotlight' effect
    const t = setTimeout(() => {
      setNavAnim(false);
    }, ANIM_MS);
    return () => clearTimeout(t);
  }, []);

  // ...existing hooks and logic...
  // Sidebar navigation items (icons only)
  const navItemsTop = [
    { icon: Home, key: 'home', label: 'Home' },
    { icon: Target, key: 'goals', label: 'Goals' },
    { icon: MessageSquare, key: 'chat', label: 'Inbox' },
    { icon: Layers, key: 'lib', label: 'Library' },
  ];
  const navItemsBottom = [
    { icon: Globe, key: 'network', label: 'Connect' },
    { icon: ShieldCheck, key: 'verify', label: 'Verify' },
    { icon: BookOpen, key: 'docs', label: 'Docs' },
    { icon: HelpCircle, key: 'support', label: 'Support' },
    { icon: Settings, key: 'settings', label: 'Settings' },
  ];

  // Helpful single-line placeholder copy for non-home nav pages
  const pagePlaceholders = {
    goals: 'Create measurable goals and milestones for your applications. Add deadlines and track progress here.',
    chat: 'Messages, counselor notes, and application threads will appear here. Use the Agent to ask questions and summarize replies.',
    lib: 'Browse and add colleges from the curated library. Use the "Browse Library" button in the header to open the catalog.',
    network: 'Find and connect with counselors, alumni, and peers. Share lists and collaborate on applications.',
    verify: 'Track required documents (transcripts, test scores, recommendations) and their verification status here.',
    docs: 'Helpful guides, templates, and resources for essays, testing, and financial aid.',
    support: 'Contact support, view troubleshooting guides, and check system status.',
    settings: 'Adjust your account preferences, notification settings, and third-party integrations.'
  };

  // NavItem is defined below (shared component)

  // derive summary stats from schools for the dashboard (safe defaults)
  const stats = useMemo(() => {
    if (!schools || schools.length === 0) return { ops: 0, totalOps: 10, percentage: 0 };
    const totalOps = schools.length * 10;
    const completedOps = schools.reduce((acc, s) => acc + Math.floor((s.progress || 0) / 10), 0);
    return {
      ops: completedOps,
      totalOps,
      percentage: Math.round((completedOps / totalOps) * 100)
    };
  }, [schools]);

  // Fetch schools from backend on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getSchools();
        if (mounted && Array.isArray(data)) setSchools(data);
      } catch (err) {
        // If backend isn't running yet, silently continue with empty list
        console.warn('Could not fetch schools (is the server running?):', err && err.message ? err.message : err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Handler for adding a new school from the modal form
  const addSchool = async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = (form.schoolName && form.schoolName.value) ? form.schoolName.value.trim() : '';
    if (!name) return;
    const payload = {
      name,
      type: 'RD',
      essays: '0/0',
      recs: '0/0',
      // default deadline set to a common RD date (can be edited per-school)
      deadline: 'Jan 1',
      progress: 0,
    };

    // optimistic UI: close modal and add a temporary item
    setShowAddModal(false);
    const tempId = `temp_${Date.now()}`;
    const tempItem = { ...payload, id: tempId };
    setSchools((s) => [tempItem, ...s]);

    try {
      const created = await apiCreateSchool(payload);
      // replace temp item with created (if returned)
      setSchools((s) => s.map(it => it.id === tempId ? created : it));
    } catch (err) {
      console.error('Failed to create school:', err);
      // rollback optimistic add
      setSchools((s) => s.filter(it => it.id !== tempId));
      // show a minimal alert to the user
      alert('Unable to create school. Make sure the backend server is running at http://localhost:4000');
    }
  };

  // Handler to delete a school
  const handleDelete = async (id) => {
    if (!id) return;
    // optimistic remove
    const prev = schools;
    setSchools((s) => s.filter(x => x.id !== id));
    try {
      await apiDeleteSchool(id);
    } catch (err) {
      console.error('Failed to delete school:', err);
      // rollback
      setSchools(prev);
      alert('Unable to delete school. Is the backend running?');
    }
  };

  // --- Inline page components (defined inside App so they capture API_BASE and app state) ---
  const GoalsSection = () => {
    const [goals, setGoals] = useState(() => {
      try { return JSON.parse(localStorage.getItem('stratum_goals') || '[]'); } catch (e) { return []; }
    });
    const [newGoal, setNewGoal] = useState('');
    useEffect(() => { localStorage.setItem('stratum_goals', JSON.stringify(goals)); }, [goals]);
    const addGoal = (e) => { e.preventDefault(); if (!newGoal.trim()) return; setGoals(g => [{ id: Date.now(), text: newGoal.trim(), done: false }, ...g]); setNewGoal(''); };
    const toggle = (id) => setGoals(g => g.map(x => x.id === id ? { ...x, done: !x.done } : x));
    const remove = (id) => setGoals(g => g.filter(x => x.id !== id));
    return (
      <div className="bg-white rounded-2xl shadow-md border border-black/5 p-8 max-w-2xl mx-auto">
        <form onSubmit={addGoal} className="flex gap-3 mb-6">
          <input 
            value={newGoal} 
            onChange={(e) => setNewGoal(e.target.value)} 
            placeholder="Add a goal (e.g. Complete Common App)" 
            className="flex-1 px-5 py-4 rounded-xl border border-black/10 bg-gray-50 focus:ring-2 focus:ring-[#e2ff8d] text-base outline-none transition" 
          />
          <button 
            type="submit" 
            className="px-6 py-3 bg-[#e2ff8d] text-black rounded-xl font-semibold shadow hover:bg-[#d6f86a] transition-all"
          >
            Add
          </button>
        </form>
        <div className="space-y-3">
          {goals.length === 0 && <div className="text-sm text-gray-400">No goals yet.</div>}
          {goals.map(g => (
            <div key={g.id} className="flex items-center justify-between p-4 rounded-xl bg-gray-50 hover:bg-[#f8fcf0] border border-black/5 transition-all">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={g.done} 
                  onChange={() => toggle(g.id)} 
                  className="accent-[#e2ff8d] w-5 h-5 rounded-full border-gray-300 focus:ring-[#e2ff8d]"
                />
                <span className={`text-base ${g.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>{g.text}</span>
              </label>
              <button 
                onClick={() => remove(g.id)} 
                className="text-xs text-red-500 px-3 py-1 rounded-lg hover:bg-red-50 transition"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const ChatSection = () => {
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [loadingMsg, setLoadingMsg] = useState(false);
    const send = async (e) => {
      e && e.preventDefault();
      if (!text.trim()) return;
      const userMsg = { from: 'user', text: text.trim(), ts: Date.now() };
      setMessages(m => [...m, userMsg]);
      setText('');
      setLoadingMsg(true);
      try {
        const res = await fetch(`${API_BASE}/api/stratum-agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: userMsg.text }) });
        if (res.ok) {
          const data = await res.json();
          const reply = data.reply || data.output || JSON.stringify(data);
          setMessages(m => [...m, { from: 'assistant', text: reply, ts: Date.now() }]);
        } else {
          setMessages(m => [...m, { from: 'assistant', text: 'Agent request failed', ts: Date.now() }]);
        }
      } catch (err) {
        setMessages(m => [...m, { from: 'assistant', text: 'Network error contacting agent', ts: Date.now() }]);
      } finally { setLoadingMsg(false); }
    };
    return (
      <div>
        <div className="mb-4 max-h-64 overflow-auto space-y-3">
          {messages.length === 0 && <div className="text-sm text-gray-400">No messages. Ask the Agent something.</div>}
          {messages.map((m, i) => (
            <div key={i} className={`p-3 rounded-md ${m.from === 'user' ? 'bg-gray-100 self-end' : 'bg-white border'}`}>
              <div className="text-sm">{m.text}</div>
            </div>
          ))}
        </div>
        <form onSubmit={send} className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message to the agent" className="flex-1 px-4 py-2 rounded-md border" />
          <button type="submit" disabled={loadingMsg} className="px-4 py-2 bg-black text-white rounded-md">{loadingMsg ? '...' : 'Send'}</button>
        </form>
      </div>
    );
  };

  const SupportForm = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [msg, setMsg] = useState('');
    const submit = (e) => { e.preventDefault(); alert('Support request sent — we will follow up via email.'); setName(''); setEmail(''); setMsg(''); };
    return (
      <form onSubmit={submit} className="space-y-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full px-4 py-2 rounded-md border" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full px-4 py-2 rounded-md border" />
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} placeholder="Message" className="w-full px-4 py-2 rounded-md border" />
        <div className="flex gap-2">
          <button type="submit" className="px-4 py-2 bg-black text-white rounded-md">Send</button>
          <button type="button" onClick={() => { setName(''); setEmail(''); setMsg(''); }} className="px-4 py-2 border rounded-md">Clear</button>
        </div>
      </form>
    );
  };

  return (
    <div className="flex h-screen w-full bg-[#f1f3f1] font-sans text-[#1a1a1a] p-4 overflow-hidden">
      {/* Sidebar with logo and icons only */}
      <aside
        className={`
          ${navExpanded ? 'w-56' : 'w-24'} bg-[#111111] rounded-[2.5rem] flex flex-col items-center py-6 text-white/40 shrink-0 shadow-2xl transition-all duration-300 ${navAnim ? 'animate-nav-expand-vertical nav-spotlight' : ''}
        `}
        style={navAnim ? { width: '4rem', height: '4rem', overflow: 'hidden', transformOrigin: 'center top' } : {}}
      >
        {/* Brand Logo */}
          <div
            onClick={() => setNavExpanded((s) => !s)}
            title="Toggle sidebar"
            className="mb-10 cursor-pointer transition-transform hover:scale-105"
          >
            <img src={LogoImg} alt="logo" className="w-12 h-12 rounded-lg shadow-[0_8px_30px_rgba(226,255,141,0.08)]" />
          </div>
        <nav className="flex flex-col flex-1 w-full px-2">
          <div className="flex flex-col items-center justify-center flex-1 space-y-5">
            {navItemsTop.map((item, i) => (
              <NavItem
                key={item.key}
                icon={item.icon}
                label={item.label}
                expanded={navExpanded}
                active={activeNav === item.key}
                anim={navAnim}
                index={i}
                onClick={() => setActiveNav(item.key)}
              />
            ))}
          </div>
          <div className="flex items-center justify-center py-2">
            <div className="w-8 h-[1px] bg-white/10" />
          </div>
          <div className="flex flex-col items-center justify-center flex-1 space-y-5">
            {navItemsBottom.map((item, i) => (
              <NavItem
                key={item.key}
                icon={item.icon}
                label={item.label}
                expanded={navExpanded}
                active={activeNav === item.key}
                anim={navAnim}
                index={navItemsTop.length + i}
                onClick={() => setActiveNav(item.key)}
              />
            ))}
          </div>
        </nav>
      </aside>

      <main className="flex-1 ml-6 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex justify-between items-start mb-6 shrink-0">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight leading-tight">
              Stratum
            </h1>
          </div>
          <div className="flex-1 px-6">
            <div className="relative max-w-md">
                  <input
                value={searchQuery}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearchQuery(v);
                  if (searchTimer.current) clearTimeout(searchTimer.current);
                  if (!v) {
                    setSearchResults([]);
                    return;
                  }
                      searchTimer.current = setTimeout(async () => {
                    setSearchLoading(true);
                    try {
                      // Use the chosen provider (google or local)
                      const res = await fetch(`${API_BASE}/api/search-schools`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: v, provider: searchProvider })
                      });
                      if (res.ok) {
                        const data = await res.json();
                        // If provider returned an error/status, surface it in the UI
                        if (data && (data.error_message || (data.status && data.status !== 'OK'))) {
                          setSearchResults([]);
                          setProviderError(data.error_message || data.status || 'Provider error');
                        } else {
                          setProviderError(null);
                          setSearchResults(data.results || []);
                        }
                      } else {
                        // Non-OK HTTP from our server
                        try {
                          const body = await res.text();
                          setProviderError(`Server error: ${res.status}`);
                          setSearchResults([]);
                        } catch (e) {
                          setProviderError(`Server error: ${res.status}`);
                          setSearchResults([]);
                        }
                      }
                    } catch (err) {
                      console.warn('search failed', err);
                    } finally { setSearchLoading(false); }
                  }, 400);
                }}
                placeholder="Search colleges (e.g. Yale)"
                className="w-full px-4 py-2 rounded-full border border-black/5 focus:outline-none"
              />
              {/* Provider toggle: Google vs Local */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-500">Provider:</span>
                <button
                  onClick={() => setSearchProvider('google')}
                  className={`text-xs px-2 py-1 rounded-lg border ${searchProvider === 'google' ? 'bg-black text-white border-black/40' : 'bg-white text-gray-600 border-black/5'}`}
                >
                  Google
                </button>
                <button
                  onClick={() => setSearchProvider('local')}
                  className={`text-xs px-2 py-1 rounded-lg border ${searchProvider === 'local' ? 'bg-black text-white border-black/40' : 'bg-white text-gray-600 border-black/5'}`}
                >
                  Local
                </button>
              </div>
              {providerError && searchProvider === 'google' && (
                <div className="mt-2 text-xs text-red-600">Google error: {String(providerError)}</div>
              )}
              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 mt-2 bg-white rounded-xl shadow-lg z-50 max-h-64 overflow-auto">
                  {searchResults.map((r, i) => (
                    <div key={i} className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex justify-between items-center" onClick={async () => {
                      // add selected school quickly
                      const payload = { name: r.name || r.school_name || 'Unknown', type: 'RD', essays: '0/0', recs: '0/0', deadline: 'Jan 1', progress: 0 };
                      try {
                        const created = await apiCreateSchool(payload);
                        setSchools(s => [created, ...s]);
                        setSearchQuery(''); setSearchResults([]);
                      } catch (err) {
                        // fallback: local optimistic add
                        setSchools(s => [{ ...payload, id: `temp_${Date.now()}` }, ...s]);
                        setSearchQuery(''); setSearchResults([]);
                      }
                    }}>
                      <div>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-gray-400">{r.city || r.address || ''} {r.state ? `· ${r.state}` : ''}</div>
                      </div>
                      <div className="text-xs text-gray-300">Add</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button className="p-3 bg-white rounded-full border border-black/5 hover:bg-gray-50 transition-colors shadow-sm">
              <Users size={20} />
            </button>
            <button
              onClick={() => setShowLibraryModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-full font-medium hover:bg-gray-50 transition-all border border-black/5"
            >
              Browse Library
            </button>
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-[#111111] text-white rounded-full font-medium hover:bg-black transition-all shadow-lg active:scale-95"
            >
              <Plus size={18} />
              <span>Add College</span>
            </button>
            <button onClick={() => setShowAgentModal(true)} className="px-4 py-2 rounded-full bg-[#e2ff8d] text-black font-semibold ml-2">Agent</button>
          </div>
        </header>

        {/* Library Modal (fixed overlay) */}
        {showLibraryModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
            <div className="w-[90%] max-w-2xl bg-white rounded-xl p-6 shadow-lg">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Colleges Library</h3>
                <button onClick={() => setShowLibraryModal(false)} className="text-gray-500">Close</button>
              </div>
              <div>
                <input
                  value={libraryQuery}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLibraryQuery(v);
                    if (libraryTimer.current) clearTimeout(libraryTimer.current);
                    if (!v) { setLibraryResults([]); return; }
                    libraryTimer.current = setTimeout(async () => {
                      setLibraryLoading(true);
                      try {
                        const res = await fetch(`${API_BASE}/api/search-schools`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: v, provider: 'local' }) });
                        if (res.ok) {
                          const data = await res.json();
                          setLibraryResults(data.results || []);
                        }
                      } catch (err) {
                        console.warn('library search failed', err);
                      } finally { setLibraryLoading(false); }
                    }, 250);
                  }}
                  placeholder="Type to search the colleges library"
                  className="w-full px-4 py-2 rounded-md border border-black/5"
                />
                <div className="mt-3 max-h-72 overflow-auto">
                  {libraryLoading && <div className="text-sm text-gray-500">Searching...</div>}
                  {!libraryLoading && libraryResults.length === 0 && libraryQuery && (
                    <div className="text-sm text-gray-400">No matches</div>
                  )}
                  {!libraryLoading && libraryResults.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer" onClick={async () => {
                      const payload = { name: r.name || r.school_name || 'Unknown', type: 'RD', essays: '0/0', recs: '0/0', deadline: 'Jan 1', progress: 0 };
                      try {
                        const created = await apiCreateSchool(payload);
                        setSchools(s => [created, ...s]);
                      } catch (err) {
                        setSchools(s => [{ ...payload, id: `temp_${Date.now()}` }, ...s]);
                      }
                      setShowLibraryModal(false);
                    }}>
                      <div>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-gray-400">{r.city || ''} {r.state ? `· ${r.state}` : ''}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          {r.acceptance_rate ? `Acceptance: ${r.acceptance_rate}` : ''} {r.mid_range ? ` · Mid-range: ${r.mid_range}` : ''} {r.undergrad_enrollment ? ` · Undergrads: ${r.undergrad_enrollment.toLocaleString()}` : ''}
                        </div>
                      </div>
                      <div className="text-xs text-gray-300">Add</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <nav className="flex gap-3 mb-8 overflow-x-auto no-scrollbar pb-2 shrink-0">
          {['Overview', 'Deadlines', 'Strategy', 'Scores', 'Financial Aid', 'Essays'].map((item) => (
            <button
              key={item}
              onClick={() => setActiveTab(item)}
              className={`px-7 py-3 rounded-2xl text-base font-semibold whitespace-nowrap transition-all border shadow-sm
                ${activeTab === item 
                  ? 'bg-[#e2ff8d] text-black border-[#e2ff8d] shadow-lg scale-105' 
                  : 'bg-white text-gray-500 border-black/10 hover:border-[#e2ff8d] hover:bg-[#f8fcf0] hover:text-black/80'}
                hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#e2ff8d]`}
              style={{ minWidth: 120 }}
            >
              {item}
            </button>
          ))}
        </nav>

        {/* Page content: show dashboard for 'home', placeholders for other nav pages */}
        {activeNav === 'home' ? (
          <div className="grid grid-cols-12 gap-6 flex-1 overflow-y-auto no-scrollbar pb-8 pr-2">
            {/* Progress Card */}
            <div className="col-span-12 lg:col-span-4 bg-white rounded-lg p-6 shadow-sm border border-black/5 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <span className="text-sm font-bold uppercase tracking-wider text-gray-400">Section Progress</span>
                  <Clock size={18} className="text-gray-400" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-semibold tracking-tighter">{stats.ops}</span>
                  <span className="text-gray-400 text-lg">/ {stats.totalOps} Tasks</span>
                </div>
                <div className="inline-flex items-center gap-2 bg-[#f8fcf0] px-3 py-1 rounded-full text-xs font-bold text-[#b8d46a] mt-3">
                  <TrendingUp size={12} />
                  <span>{stats.percentage}% Completion Rate</span>
                </div>
              </div>
              <div className="flex gap-2 mt-8">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className={`h-14 flex-1 rounded-full transition-all duration-500 ${i < Math.floor(stats.percentage/10) ? 'bg-[#1a1a1a]' : 'bg-[#f0f0f0]'}`} />
                ))}
              </div>
            </div>

            {/* AI Insights Card */}
            <div className="col-span-12 lg:col-span-5 bg-[#e2ff8d] rounded-lg p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group">
              <div className="relative z-10">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-sm font-bold uppercase tracking-wider text-black/60">AI Strategy Insight</span>
                  <div className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center">
                    <AlertCircle size={16} />
                  </div>
                </div>
                <h3 className="text-2xl font-semibold leading-tight mb-4">
                  Deadline Cluster Alert: <br/>
                  {schools.length > 0 ? 'Reviewing submissions' : 'No deadlines yet'}
                </h3>
                <p className="text-black/60 text-sm leading-relaxed max-w-[80%]">
                  Your reach-to-safety ratio is currently being analyzed. Add more schools to get precise strategy feedback.
                </p>
              </div>
              <button className="absolute z-20 left-7 bottom-4 bg-black text-white px-6 py-3 rounded-full font-semibold flex items-center justify-center gap-2 hover:scale-105 transition-transform shadow-md">
                View Strategy Map <ArrowRight size={16} />
              </button>
              <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:rotate-12 transition-transform duration-700">
                <Rocket size={200} />
              </div>
            </div>

            {/* Fit Engine Preview */}
            <div className="col-span-12 lg:col-span-3 bg-[#111111] rounded-lg p-6 text-white flex flex-col justify-between shadow-lg">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <Award size={20} className="text-[#e2ff8d]" />
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Score Comparison</span>
                </div>
                <span className="text-sm opacity-60">Avg. SAT Match</span>
                <div className="text-3xl font-bold mt-1 text-[#e2ff8d]">92% Match</div>
              </div>
              <div className="space-y-4">
                <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-[#e2ff8d]" style={{ width: '92%' }}></div>
                </div>
                <p className="text-[10px] leading-relaxed opacity-40">
                  Based on current Common Data Set (CDS) benchmarks for your top 5 selections.
                </p>
              </div>
            </div>

            {/* School List Table */}
            <div className="col-span-12 lg:col-span-9 bg-white rounded-lg p-8 shadow-sm border border-black/5">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <BarChart3 size={20} className="text-gray-400" />
                  <h2 className="text-2xl font-semibold">Active Applications</h2>
                </div>
                <div className="flex gap-2 text-xs font-bold uppercase tracking-wider">
                  <div className="px-3 py-1 bg-gray-50 rounded-lg border border-black/5">ED: {schools.filter(s => s.type === 'ED' || s.type === 'REA').length}</div>
                  <div className="px-3 py-1 bg-gray-50 rounded-lg border border-black/5">RD: {schools.filter(s => s.type === 'RD').length}</div>
                </div>
              </div>

              <div className="space-y-4">
                {schools.map((school) => (
                  <div key={school.id} className="group flex items-center gap-4 p-4 rounded-[1.5rem] hover:bg-gray-50 transition-all border border-transparent hover:border-black/5">
                    <div className="w-12 h-12 rounded-xl bg-[#f1f3f1] flex items-center justify-center font-bold text-xl text-black/20 group-hover:bg-[#e2ff8d] group-hover:text-black transition-colors">
                      {school.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold">{school.name}</h4>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter ${
                          school.type === 'REA' || school.type === 'ED' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                        }`}>
                          {school.type}
                        </span>
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><FileText size={12}/> {school.essays || '0/0'} Essays</span>
                        <span className="flex items-center gap-1"><Users size={12}/> {school.recs || '0/0'} Recs</span>
                        <span className="flex items-center gap-1"><Calendar size={12}/> {school.deadline}</span>
                      </div>
                    </div>
                    
                    {/* Score Fit Bar */}
                    <div className="hidden lg:flex flex-col items-center gap-1 w-32 px-4">
                       <div className="w-full h-1.5 bg-gray-100 rounded-full relative overflow-hidden">
                          <div 
                            className="absolute h-full bg-[#e2ff8d] opacity-50" 
                            style={{ left: '20%', right: '20%' }}
                          />
                          <div 
                            className="absolute top-0 bottom-0 w-1 bg-black z-10" 
                            style={{ left: '65%' }}
                          />
                       </div>
                       <span className="text-[10px] font-bold text-gray-300">Target Fit</span>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-sm font-bold">{school.progress}%</div>
                        <div className="w-24 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-black transition-all duration-1000" style={{ width: `${school.progress}%` }}></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="w-8 h-8 rounded-full border border-black/5 flex items-center justify-center hover:bg-black hover:text-white transition-all" title="View">
                          <ChevronRight size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete ${school.name} from your list?`)) handleDelete(school.id);
                          }}
                          className="w-8 h-8 rounded-full border border-black/5 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {schools.length === 0 && (
                  <div className="py-20 text-center text-gray-400 text-sm font-medium">
                    No schools added to your list yet.
                  </div>
                )}
              </div>
            </div>

            {/* Score Fit Details */}
            <div className="col-span-12 lg:col-span-3 flex flex-col gap-4">
              <div className="bg-[#1a1a1a] text-white p-6 rounded-lg shadow-xl">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Target size={18} className="text-[#e2ff8d]" />
                  Profile Sync
                </h3>
                <div className="space-y-6">
                  <ScoreItem label="SAT Composite" val={studentProfile.sat} max={1600} />
                  <ScoreItem label="ACT Composite" val={studentProfile.act} max={36} />
                  <ScoreItem label="Unweighted GPA" val={studentProfile.gpa} max={4.0} color="#e2ff8d" />
                </div>
                <button className="w-full mt-8 py-3 bg-white/10 rounded-2xl text-xs font-bold hover:bg-white/20 transition-colors uppercase tracking-widest">
                  Update Scores
                </button>
              </div>

              <div className="bg-white p-6 rounded-lg border border-black/5 flex-1">
                <h4 className="font-bold text-sm mb-4">Quick Resources</h4>
                <div className="space-y-3">
                  <ResourceItem icon={BookOpen} title="Essay Guide" />
                  <ResourceItem icon={Rocket} title="Early Strategy" />
                  <ResourceItem icon={Puzzle} title="CDS Database" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-6 flex-1 overflow-y-auto no-scrollbar pb-8 pr-2">
            <div className="col-span-12 lg:col-span-9 space-y-6">
              {/* Goals */}
              {activeNav === 'goals' && (
                <div className="bg-white rounded-2xl shadow-md border border-black/5 p-8">
                  <h2 className="text-2xl font-semibold mb-4">Goals</h2>
                  <p className="text-sm text-gray-500 mb-6">Create measurable goals and milestones for your applications.</p>
                  <GoalsSection />
                </div>
              )}

              {/* Chat */}
              {activeNav === 'chat' && (
                <div className="bg-white rounded-2xl shadow-md border border-black/5 p-8">
                  <h2 className="text-2xl font-semibold mb-4">Inbox</h2>
                  <p className="text-sm text-gray-500 mb-4">Direct messages, counselor notes, and AI assistant replies.</p>
                  <ChatSection />
                </div>
              )}

              {/* Library */}
              {activeNav === 'lib' && (
                <div className="bg-white rounded-2xl shadow-md border border-black/5 p-8">
                  <h2 className="text-2xl font-semibold mb-4">Library</h2>
                  <p className="text-sm text-gray-500 mb-4">Search the curated colleges library and add entries to your list.</p>
                  <div>
                    <input value={libraryQuery} onChange={(e) => {
                      const v = e.target.value; setLibraryQuery(v);
                      if (libraryTimer.current) clearTimeout(libraryTimer.current);
                      if (!v) { setLibraryResults([]); return; }
                      libraryTimer.current = setTimeout(async () => {
                        setLibraryLoading(true);
                        try {
                          const res = await fetch(`${API_BASE}/api/search-schools`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: v, provider: 'local' }) });
                          if (res.ok) {
                            const data = await res.json(); setLibraryResults(data.results || []);
                          }
                        } catch (err) { console.warn('library search failed', err); }
                        finally { setLibraryLoading(false); }
                      }, 250);
                    }} placeholder="Type to search the colleges library" className="w-full px-4 py-2 rounded-md border border-black/5" />

                    <div className="mt-4 max-h-72 overflow-auto">
                      {libraryLoading && <div className="text-sm text-gray-500">Searching...</div>}
                      {!libraryLoading && libraryResults.length === 0 && libraryQuery && (<div className="text-sm text-gray-400">No matches</div>)}
                      {!libraryLoading && libraryResults.map((r, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer" onClick={async () => {
                          const payload = { name: r.name || r.school_name || 'Unknown', type: 'RD', essays: '0/0', recs: '0/0', deadline: 'Jan 1', progress: 0 };
                          try { const created = await apiCreateSchool(payload); setSchools(s => [created, ...s]); } catch (err) { setSchools(s => [{ ...payload, id: `temp_${Date.now()}` }, ...s]); }
                        }}>
                          <div>
                            <div className="font-medium">{r.name}</div>
                            <div className="text-xs text-gray-400">{r.city || ''} {r.state ? `· ${r.state}` : ''}</div>
                          </div>
                          <div className="text-xs text-gray-300">Add</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Network */}
              {activeNav === 'network' && (
                <div className="bg-white rounded-2xl shadow-md border border-black/5 p-8">
                  <h2 className="text-2xl font-semibold mb-4">Connect</h2>
                  <p className="text-sm text-gray-500 mb-4">Find and connect with counselors, alumni, and peers.</p>
                  <div className="space-y-3">
                    {[
                      { name: 'Alex Johnson', role: 'Counselor', org: 'West High' },
                      { name: 'Priya Singh', role: 'Alumnus', org: 'Princeton' },
                      { name: 'Carlos M.', role: 'Mentor', org: 'College Coach' }
                    ].map((c, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-2xl hover:bg-gray-50">
                        <div>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-gray-400">{c.role} · {c.org}</div>
                        </div>
                        <button className="px-3 py-1 rounded-full border bg-white text-xs">Connect</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verify */}
              {activeNav === 'verify' && (
                <div className="bg-white rounded-2xl shadow-md border border-black/5 p-8">
                  <h2 className="text-2xl font-semibold mb-4">Verify</h2>
                  <p className="text-sm text-gray-500 mb-4">Track required documents for your applications.</p>
                  <div className="space-y-4">
                    {(schools.length === 0) ? (
                      <div className="text-sm text-gray-400">No schools in your list yet. Add a college to start tracking documents.</div>
                    ) : (
                      schools.map((s) => (
                        <div key={s.id} className="p-3 rounded-lg border border-black/5 hover:bg-gray-50">
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="font-bold">{s.name}</div>
                              <div className="text-xs text-gray-400">{s.type} · Deadline: {s.deadline}</div>
                            </div>
                            <div className="text-xs text-gray-500">Progress: {s.progress}%</div>
                          </div>
                          <div className="mt-3 flex gap-2">
                            {['Transcript', 'Test Scores', 'Recommendations'].map((doc, i) => (
                              <div key={i} className="px-3 py-1 rounded-full bg-gray-50 text-xs">{doc}: <span className="font-semibold">Pending</span></div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Docs */}
              {activeNav === 'docs' && (
                <div className="bg-white rounded-2xl shadow-md border border-black/5 p-8">
                  <h2 className="text-2xl font-semibold mb-4">Docs</h2>
                  <p className="text-sm text-gray-500 mb-4">Guides, templates, and resources for essays, testing, and financial aid.</p>
                  <div className="space-y-3">
                    <ResourceItem icon={BookOpen} title="Essay Guide" />
                    <ResourceItem icon={Rocket} title="Early Strategy" />
                    <ResourceItem icon={Puzzle} title="CDS Database" />
                  </div>
                </div>
              )}

              {/* Support */}
              {activeNav === 'support' && (
                <div className="bg-white rounded-2xl shadow-md border border-black/5 p-8">
                  <h2 className="text-2xl font-semibold mb-4">Support</h2>
                  <p className="text-sm text-gray-500 mb-4">Send us a message and we'll get back to you.</p>
                  <SupportForm />
                </div>
              )}

              {/* Settings */}
              {activeNav === 'settings' && (
                <div className="bg-white rounded-2xl shadow-md border border-black/5 p-8">
                  <h2 className="text-2xl font-semibold mb-4">Settings</h2>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">Default Search Provider</span>
                      <div className="ml-auto flex gap-2">
                        <button onClick={() => setSearchProvider('local')} className={`px-3 py-1 rounded-lg ${searchProvider==='local' ? 'bg-black text-white' : 'bg-white border'}`}>Local</button>
                        <button onClick={() => setSearchProvider('google')} className={`px-3 py-1 rounded-lg ${searchProvider==='google' ? 'bg-black text-white' : 'bg-white border'}`}>Google</button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">API Base (optional)</label>
                      <input value={API_BASE} onChange={() => { alert('To change API base, update VITE_API_BASE or edit the code.') }} className="w-full px-4 py-2 rounded-md border" />
                    </div>
                  </div>
                </div>
              )}

              {/* Fallback */}
              {(!['goals','chat','lib','network','verify','docs','support','settings'].includes(activeNav)) && (
                <div className="bg-white rounded-2xl shadow-md border border-black/5 p-8">
                  <h2 className="text-2xl font-semibold mb-4">{activeNav.charAt(0).toUpperCase() + activeNav.slice(1)}</h2>
                  <p className="text-gray-600">{pagePlaceholders[activeNav] || `This is the ${activeNav} page.`}</p>
                </div>
              )}
            </div>

            <div className="col-span-12 lg:col-span-3 flex flex-col gap-4">
              <div className="bg-[#1a1a1a] text-white p-6 rounded-lg shadow-xl">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Target size={18} className="text-[#e2ff8d]" />
                  Profile Sync
                </h3>
                <div className="space-y-6">
                  <ScoreItem label="SAT Composite" val={studentProfile.sat} max={1600} />
                  <ScoreItem label="ACT Composite" val={studentProfile.act} max={36} />
                  <ScoreItem label="Unweighted GPA" val={studentProfile.gpa} max={4.0} color="#e2ff8d" />
                </div>
                <button className="w-full mt-8 py-3 bg-white/10 rounded-2xl text-xs font-bold hover:bg-white/20 transition-colors uppercase tracking-widest">
                  Update Scores
                </button>
              </div>

              <div className="bg-white p-6 rounded-lg border border-black/5 flex-1">
                <h4 className="font-bold text-sm mb-4">Quick Resources</h4>
                <div className="space-y-3">
                  <ResourceItem icon={BookOpen} title="Essay Guide" />
                  <ResourceItem icon={Rocket} title="Early Strategy" />
                  <ResourceItem icon={Puzzle} title="CDS Database" />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Add School Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-lg p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h2 className="text-2xl font-bold mb-6">Add New College</h2>
            <form onSubmit={addSchool} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">College Name</label>
                <input 
                  name="schoolName"
                  autoFocus
                  required
                  placeholder="e.g. Yale University"
                  className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-[#e2ff8d]"
                />
              </div>
              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-4 rounded-2xl font-bold text-gray-400 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-4 bg-black text-white rounded-2xl font-bold hover:bg-black/80 transition-all shadow-lg"
                >
                  Add to List
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Agent Modal */}
      {showAgentModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-lg p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Stratum Agent</h2>
              <button onClick={() => setShowAgentModal(false)} className="text-sm text-gray-500">Close</button>
            </div>
            <textarea value={agentPrompt} onChange={(e) => setAgentPrompt(e.target.value)} rows={4} className="w-full p-3 border rounded-lg mb-3" placeholder="Ask the agent a question..." />
            <div className="flex gap-2">
              <button onClick={async () => {
                if (!agentPrompt) return;
                setAgentLoading(true); setAgentReply('');
                try {
                  const res = await fetch(`${API_BASE}/api/stratum-agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: agentPrompt }) });
                  if (res.ok) {
                    const data = await res.json();
                    setAgentReply(data.reply || JSON.stringify(data));
                  } else {
                    setAgentReply('Agent request failed');
                  }
                } catch (err) { setAgentReply('Network error contacting agent'); }
                setAgentLoading(false);
              }} className="px-4 py-2 bg-black text-white rounded-lg">Send</button>
              <button onClick={() => { setAgentPrompt(''); setAgentReply(''); }} className="px-4 py-2 border rounded-lg">Clear</button>
            </div>
            <div className="mt-4">
              <h4 className="font-semibold">Reply</h4>
              <div className="mt-2 p-3 bg-gray-50 rounded-lg min-h-[80px]">{agentLoading ? 'Thinking...' : agentReply || <span className="text-gray-400">No reply yet</span>}</div>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
};

const NavItem = ({ icon: Icon, label = '', active = false, onClick, anim = false, expanded = false, index = 0 }) => {
  return (
    <div
      onClick={onClick}
      className={`w-full cursor-pointer transition-all duration-300 group relative flex items-center ${expanded ? 'justify-start pl-4' : 'justify-center'} ${active ? 'bg-[#181818] shadow-lg' : 'hover:bg-[#232323]'} rounded-2xl my-1`}
      style={{ minHeight: 60 }}
    >
      {/* Icon pill - animate only the icon when anim is true. */}
      <div
        className={`w-14 h-14 p-3.5 rounded-2xl flex items-center justify-center ${active ? 'bg-[#e2ff8d] text-black shadow-md' : 'text-[#e2ff8d] hover:text-white hover:bg-white/5'} ${anim ? 'animate-icon-pop' : ''}`}
        style={anim ? { animationDelay: `${200 + index * 80}ms` } : {}}
      >
        <Icon size={22} strokeWidth={2} className="relative z-10" />
      </div>

      {/* Label shown only when expanded (clicking logo). No animation applied so it does not animate during initial mount. */}
      {expanded && (
        <span className={`ml-4 text-base font-semibold ${active ? 'text-[#e2ff8d]' : 'text-gray-200 group-hover:text-white'}`}>
          {label}
        </span>
      )}

      {/* Active Indicator (green glow on the left when selected) */}
      {active && (
        <div className={`absolute inset-y-3 left-0 w-2 bg-[#e2ff8d] rounded-r-full shadow-[0_0_18px_#e2ff8d]`} />
      )}
    </div>
  );
};

const ScoreItem = ({ label, val, max, color = "white" }) => (
  <div className="space-y-1.5">
    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest opacity-40">
      <span>{label}</span>
      <span>{val}/{max}</span>
    </div>
    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
      <div 
        className="h-full transition-all duration-1000 ease-out" 
        style={{ width: `${(val/max)*100}%`, backgroundColor: color }}
      ></div>
    </div>
  </div>
);

const ResourceItem = ({ icon: Icon, title }) => (
  <div className="flex items-center justify-between p-3 rounded-2xl hover:bg-gray-50 transition-colors cursor-pointer group border border-transparent hover:border-black/5">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center group-hover:bg-[#e2ff8d] transition-colors">
        <Icon size={14} className="text-gray-400 group-hover:text-black" />
      </div>
      <span className="text-xs font-bold">{title}</span>
    </div>
    <ChevronRight size={14} className="text-gray-200 group-hover:text-black" />
  </div>
);

export default App;
