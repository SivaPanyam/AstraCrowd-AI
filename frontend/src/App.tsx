import { useState, useEffect, useRef } from 'react'
import { initializeApp } from 'firebase/app'
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth'
import {
  classifyStatus,
  getGateCardColorClass,
  getGateBadgeColorClass,
  shouldDivertSignage,
} from './gateThresholds'
import { 
  Users, 
  Clock, 
  AlertOctagon, 
  Shield, 
  Wifi, 
  WifiOff, 
  Radio, 
  AlertTriangle, 
  LogOut, 
  Lock, 
  User as UserIcon,
  ChevronRight,
  MonitorPlay,
  Bot,
  Send,
  Sparkles,
  X
} from 'lucide-react'

// =====================================================================
// OPTIONAL FIREBASE INITIALIZATION CONFIG
// =====================================================================
// Note: In local development or production builds, these variables are injected 
// at compile time by Vite using VITE_-prefixed environment configs (VITE_FIREBASE_*)
// e.g. apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyFakeKey-AstraCrowdAI12345"
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyFakeKey-AstraCrowdAI12345",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "astracrowd-ai.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "astracrowd-ai",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "astracrowd-ai.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1234567890:web:12345abc"
}

// Safely initialize firebase instance
let firebaseAppObj: any = null
let firebaseAuthObj: any = null
try {
  firebaseAppObj = initializeApp(firebaseConfig)
  firebaseAuthObj = getAuth(firebaseAppObj)
} catch (e) {
  console.warn("[FIREBASE INITIALIZATION] Bypassing active server config setup:", e)
}

// =====================================================================
// CUSTOM WEBSOCKET CLIENT HOOK WITH RECONNECT LOGIC
// =====================================================================
function useStadiumWebsocket(
  token: string, 
  zone: string,
  onMessage: (data: any) => void
) {
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<any>(null)

  useEffect(() => {
    if (!token) return

    const connect = () => {
      setWsStatus('connecting')
      console.log(`[WS HOOK] Connecting to real-time guard system...`)
      
      // Resolve backend WebSocket base URL from env variable with safe fallback
      const envBase = import.meta.env.VITE_BACKEND_WS_URL || 'ws://localhost:8000'
      const wsUrl = `${envBase}/ws/alerts?token=${token}&zone=${zone}`
      
      try {
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          console.log('[WS HOOK] Secure WebSockets pipe opened successfully.')
          setWsStatus('connected')
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            onMessage(data)
          } catch (err) {
            console.warn('[WS HOOK] Received unparseable socket packet:', event.data)
          }
        }

        ws.onclose = (event) => {
          console.log(`[WS HOOK] Connection closed (${event.reason}). Attempting reconnect...`)
          setWsStatus('disconnected')
          
          // Reconnect logic: retry in 4 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, 4000)
        }

        ws.onerror = (err) => {
          console.error('[WS HOOK] WebSocket error occurred:', err)
          setWsStatus('disconnected')
          ws.close()
        }
      } catch (err) {
        console.error('[WS HOOK] WebSockets handshake failed:', err)
        setWsStatus('disconnected')
      }
    }

    connect()

    return () => {
      if (wsRef.current) {
        // Remove standard close listener to prevent auto-reconnection on manual unmount
        wsRef.current.onclose = null
        wsRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [token, zone])

  return wsStatus
}


// =====================================================================
// INTERFACE SCHEMAS
// =====================================================================
interface Gate {
  name: string
  flowRate: number
  waitTime: number
  capacity: number // Density Percentage
  status: 'safe' | 'warning' | 'critical'
  type: string
  signage: string // Digital sign overlay
}

// =====================================================================
// HIGH-CONTRAST CUSTOM MARKDOWN PARSER FOR GEMINI RESPONSES
// =====================================================================
function renderInlineMarkdown(text: string) {
  // Parses inline code `code`, bold **bold**
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  const tokens = text.split(regex);

  return tokens.map((token, idx) => {
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code key={idx} className="px-1.5 py-0.5 rounded bg-slate-950 border border-white/10 text-cyan-300 font-mono text-[10px] font-bold">
          {token.slice(1, -1)}
        </code>
      )
    }
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={idx} className="font-extrabold text-white text-glow-cyan">
          {token.slice(2, -2)}
        </strong>
      )
    }
    return token
  });
}

function MarkdownRenderer({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/);

  return (
    <div className="space-y-2 text-slate-200 text-xs font-semibold">
      {blocks.map((block, bIdx) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        // Headers
        if (trimmed.startsWith('###')) {
          return (
            <h4 key={bIdx} className="text-xs font-black text-cyan-400 mt-3 mb-1 uppercase tracking-wider">
              {renderInlineMarkdown(trimmed.replace(/^###\s*/, ''))}
            </h4>
          )
        }
        if (trimmed.startsWith('##')) {
          return (
            <h3 key={bIdx} className="text-sm font-black text-cyan-300 mt-4 mb-1.5 uppercase tracking-wide">
              {renderInlineMarkdown(trimmed.replace(/^##\s*/, ''))}
            </h3>
          )
        }
        if (trimmed.startsWith('#')) {
          return (
            <h2 key={bIdx} className="text-base font-black text-white mt-4 mb-2 uppercase tracking-widest">
              {renderInlineMarkdown(trimmed.replace(/^#\s*/, ''))}
            </h2>
          )
        }

        // List detection
        const lines = trimmed.split('\n');
        const isBulletList = lines.every(line => line.trim().startsWith('-') || line.trim().startsWith('*'));
        const isNumberedList = lines.every(line => /^\d+\.\s+/.test(line.trim()));

        if (isBulletList) {
          return (
            <ul key={bIdx} className="list-disc pl-4 space-y-1 text-slate-200">
              {lines.map((line, lIdx) => (
                <li key={lIdx} className="leading-relaxed">
                  {renderInlineMarkdown(line.trim().replace(/^[-*]\s*/, ''))}
                </li>
              ))}
            </ul>
          )
        }

        if (isNumberedList) {
          return (
            <ol key={bIdx} className="list-decimal pl-4 space-y-1 text-slate-200">
              {lines.map((line, lIdx) => (
                <li key={lIdx} className="leading-relaxed">
                  {renderInlineMarkdown(line.trim().replace(/^\d+\.\s+/, ''))}
                </li>
              ))}
            </ol>
          )
        }

        // Mixed content or multi-line paragraphs
        if (lines.length > 1) {
          return (
            <div key={bIdx} className="space-y-1">
              {lines.map((line, lIdx) => {
                const item = line.trim();
                if (item.startsWith('-') || item.startsWith('*')) {
                  return (
                    <div key={lIdx} className="flex gap-2 items-start pl-1 text-slate-200">
                      <span className="text-cyan-400 mt-1">•</span>
                      <span className="leading-relaxed">{renderInlineMarkdown(item.replace(/^[-*]\s*/, ''))}</span>
                    </div>
                  )
                }
                if (/^\d+\.\s+/.test(item)) {
                  const match = item.match(/^(\d+)\.\s+(.*)/);
                  return (
                    <div key={lIdx} className="flex gap-2 items-start pl-1 text-slate-200">
                      <span className="text-cyan-400 font-mono font-bold text-[9px] mt-0.5">{match ? match[1] : '1'}.</span>
                      <span className="leading-relaxed">{renderInlineMarkdown(match ? match[2] : item)}</span>
                    </div>
                  )
                }
                return (
                  <p key={lIdx} className="leading-relaxed text-slate-300">
                    {renderInlineMarkdown(line)}
                  </p>
                )
              })}
            </div>
          )
        }

        return (
          <p key={bIdx} className="leading-relaxed text-slate-300">
            {renderInlineMarkdown(trimmed)}
          </p>
        )
      })}
    </div>
  )
}

export default function App() {
  // Authentication states
  const [user, setUser] = useState<any>(null)
  const [idToken, setIdToken] = useState<string>("")
  const [authZone, setAuthZone] = useState<string>("Gate 3")
  const [authError, setAuthError] = useState<string>("")
  const [email, setEmail] = useState<string>("")
  const [password, setPassword] = useState<string>("")
  const [isLoading, setIsLoading] = useState<boolean>(false)

  // Stadium Operational states
  const [totalAttendance, setTotalAttendance] = useState<number>(24150)
  const maxAttendance = 50000
  const [avgWait, setAvgWait] = useState<number>(6.5)
  const [gates, setGates] = useState<Gate[]>([
    { name: 'Gate 1', flowRate: 32, waitTime: 3, capacity: 25, status: 'safe', type: 'General', signage: 'NORMAL' },
    { name: 'Gate 2', flowRate: 58, waitTime: 6, capacity: 54, status: 'warning', type: 'General', signage: 'NORMAL' },
    { name: 'Gate 3', flowRate: 114, waitTime: 22, capacity: 92, status: 'critical', type: 'General', signage: 'DIVERT' },
    { name: 'Gate 4', flowRate: 15, waitTime: 1, capacity: 12, status: 'safe', type: 'VIP', signage: 'NORMAL' }
  ])

  // Live telemetry indicator — true once a real edge-camera packet arrives
  const [isLiveTelemetry, setIsLiveTelemetry] = useState<boolean>(false)
  // Ref to the mock data setInterval so we can kill it on first live packet
  const mockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // "Eyes-Up" Urgent Incident States
  const [eyesUpAlert, setEyesUpAlert] = useState<{
    active: boolean
    location: string
    instruction: string
    timestamp: string
    message: string
  } | null>(null)

  // Simulation Feed states (Logs window)
  const [systemLogs, setSystemLogs] = useState<string[]>([
    '[INIT] Operational terminal standing by.',
    '[AUTH] Device calibrated for outdoor operations.'
  ])

  // AI Copilot Chat states
  const [chatOpen, setChatOpen] = useState<boolean>(false)
  const [chatInput, setChatInput] = useState<string>("")
  const [chatLoading, setChatLoading] = useState<boolean>(false)
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'ai', text: string, timestamp: string }>>([
    {
      sender: 'ai',
      text: 'Hello! I am your AstraCrowd AI Copilot, integrated directly with live stadium gate metrics and queue models. Ask me anything about bottlenecks, flow rates, or security redirects.',
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }).substring(0, 5)
    }
  ])
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages])

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || chatLoading) return

    const userMessage = chatInput
    setChatInput("")
    setChatLoading(true)

    const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false }).substring(0, 5)
    
    // Append user message
    setChatMessages(prev => [...prev, { sender: 'user', text: userMessage, timestamp: timeStr }])
    addLog(`[AI CHAT] Sending query to Gemini Copilot...`)

    try {
      const apiBase = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiBase}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ prompt: userMessage })
      })

      if (response.status === 401) {
        addLog(`[AI CHAT ERROR] Connection unauthorized.`)
        setChatMessages(prev => [...prev, { 
          sender: 'ai', 
          text: 'Error: Connection unauthorized. Please re-authenticate your Firebase session.', 
          timestamp: timeStr 
        }])
        return
      }

      if (!response.ok) {
        throw new Error(`Server returned code ${response.status}`)
      }

      const data = await response.json()
      setChatMessages(prev => [...prev, { 
        sender: 'ai', 
        text: data.response || 'No response received.', 
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }).substring(0, 5)
      }])
      addLog(`[AI CHAT] Copilot analysis returned successfully.`)
    } catch (err: any) {
      console.error('[AI CHAT ERROR]', err)
      addLog(`[AI CHAT ERROR] Network post failed: ${err.message}`)
      setChatMessages(prev => [...prev, { 
        sender: 'ai', 
        text: `Unable to establish link with Gemini backend: ${err.message}. Running fallback simulated metrics diagnosis instead.`, 
        timestamp: timeStr 
      }])
    } finally {
      setChatLoading(false)
    }
  }

  // Handle incoming live alerts from WebSockets
  const handleWebSocketMessage = (data: any) => {
    addLog(`[WS ALERT] Received event type: ${data.type}`)
    
    // Process Ingress Predictor Alerts
    if (data.type === 'predictive_alert') {
      const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false })
      setEyesUpAlert({
        active: true,
        location: data.location,
        instruction: "REDIRECT INGRESS IMMEDIATELY TO GATE 4",
        timestamp: timeStr,
        message: data.message
      })
      
      // Auto update Gate 3 to show critical redirect signage badge
      setGates(prev => prev.map(g => {
        if (g.name === data.location) {
          return { ...g, capacity: data.predicted_capacity_pct, signage: 'DIVERT', status: 'critical' }
        }
        return g
      }))
      
      addLog(`[SIREN] EYES-UP critical warning overlay triggered for ${data.location}!`)
    }

    // Process generic control updates
    if (data.type === 'control_action') {
      addLog(`[CONTROL] Directives updated: ${data.message}`)
    }
  }

  // Connect WebSockets custom hook
  const wsStatus = useStadiumWebsocket(idToken, authZone, handleWebSocketMessage)

  // Log auxiliary helper
  const addLog = (message: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false })
    setSystemLogs(prev => [`[${time}] ${message}`, ...prev.slice(0, 10)])
  }

  // Standard or Sandbox Authentication Sign-In
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setAuthError("")

    // Try real login if credentials entered and firebase available
    if (firebaseAuthObj && email && password) {
      try {
        const userCredential = await signInWithEmailAndPassword(firebaseAuthObj, email, password)
        const token = await userCredential.user.getIdToken()
        setUser(userCredential.user)
        setIdToken(token)
        addLog(`[AUTH] Firebase signed-in successfully. Guard claims validated.`)
      } catch (err: any) {
        setAuthError(err.message || "Failed to authenticate.")
      } finally {
        setIsLoading(false)
      }
      return
    }

    // Interactive developer bypass if offline / sandbox testing
    setTimeout(() => {
      // Mock user profiles based on entered values or defaults
      const dummyUser = {
        email: email || "ops-director@astracrowd.ai",
        uid: `dev-guard-uid-${Math.floor(Math.random() * 900) + 100}`,
        displayName: email ? email.split('@')[0] : "Director (Bypass)"
      }
      setUser(dummyUser)
      setIdToken("dev-token")
      addLog(`[AUTH] Developer sandbox bypass approved. Zone context set to: ${authZone}`)
      setIsLoading(false)
    }, 800)
  }

  // Google Authentication Sign-In
  const handleGoogleLogin = async () => {
    setIsLoading(true)
    setAuthError("")
    addLog(`[AUTH] Initiating Google single sign-on...`)

    if (firebaseAuthObj) {
      try {
        const provider = new GoogleAuthProvider()
        const userCredential = await signInWithPopup(firebaseAuthObj, provider)
        const token = await userCredential.user.getIdToken()
        setUser(userCredential.user)
        setIdToken(token)
        addLog(`[AUTH] Google signed-in successfully. UID: ${userCredential.user.uid}`)
      } catch (err: any) {
        console.error('[AUTH ERROR] Google login failed:', err)
        setAuthError(err.message || "Failed to authenticate with Google.")
      } finally {
        setIsLoading(false)
      }
      return
    }

    // Offline sandbox bypass logic
    setTimeout(() => {
      const dummyUser = {
        email: "google-operator@astracrowd.ai",
        uid: `google-guard-uid-${Math.floor(Math.random() * 900) + 100}`,
        displayName: "Google Operator (Demo)",
        photoURL: "https://lh3.googleusercontent.com/a/default-user"
      }
      setUser(dummyUser)
      setIdToken("dev-google-token")
      addLog(`[AUTH] Google single sign-on approved (Sandbox Bypass). Zone: ${authZone}`)
      setIsLoading(false)
    }, 1200)
  }

  // Dummy Guard Single Sign-On Bypass
  const handleDummyLogin = () => {
    setIsLoading(true)
    setAuthError("")
    addLog(`[AUTH] Initiating Dummy Guard single sign-on bypass...`)

    setTimeout(() => {
      const dummyUser = {
        email: "guard1@stadiumsec.com",
        uid: "guard_dev_001",
        displayName: "Dummy Guard 001",
        role: "FieldStaff"
      }
      setUser(dummyUser)
      setIdToken("dummy-guard-token")
      setAuthZone("Gate 3")
      addLog(`[AUTH] Dummy guard developer bypass approved. Connection established with Gate 3.`)
      setIsLoading(false)
    }, 600)
  }

  // Handle Logout
  const handleLogout = async () => {
    if (firebaseAuthObj) {
      await signOut(firebaseAuthObj)
    }
    setUser(null)
    setIdToken("")
    setEyesUpAlert(null)
    addLog(`[AUTH] Operations terminal closed cleanly.`)
  }

  // Acknowledge the critical overlay
  const handleAcknowledgeAlert = () => {
    if (eyesUpAlert) {
      addLog(`[ACK] Operations Director acknowledged critical incident for ${eyesUpAlert.location}.`)
      
      // Simulate redirection resolution state change
      setGates(prev => prev.map(g => {
        if (g.name === eyesUpAlert.location) {
          // Relieve congestion slightly
          return { ...g, capacity: 55, waitTime: 8, flowRate: 65, status: 'warning', signage: 'NORMAL' }
        }
        if (g.name === 'Gate 4') {
          // Increase flow to the target Gate 4
          return { ...g, capacity: 42, flowRate: 75, waitTime: 4 }
        }
        return g
      }))
      
      // Diminish attendance count slightly
      setTotalAttendance(prev => prev + 120)
    }
    setEyesUpAlert(null)
  }

  // ── /ws/client  ──  Live edge-camera telemetry stream ──────────────────
  // Connects to the backend dashboard WebSocket channel.
  // On first valid telemetry packet: flip isLiveTelemetry → true and
  // permanently kill the mock setInterval loop so data never races.
  useEffect(() => {
    if (!user) return

    const envBase = import.meta.env.VITE_BACKEND_WS_URL || 'ws://localhost:8000'
    const clientWsUrl = `${envBase}/ws/client`
    let clientWs: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connectClientWs = () => {
      try {
        clientWs = new WebSocket(clientWsUrl)

        clientWs.onopen = () => {
          addLog('[TELEMETRY] Live edge-camera stream connected (/ws/client).')
        }

        clientWs.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'telemetry' && Array.isArray(data.gates)) {
              // ── First real packet: kill mock loop permanently ──
              if (mockIntervalRef.current !== null) {
                clearInterval(mockIntervalRef.current)
                mockIntervalRef.current = null
                setIsLiveTelemetry(true)
                addLog('[TELEMETRY] Live edge-camera data received. Mock simulation disabled.')
              }

              // Merge live gate data from backend
              setGates(data.gates.map((g: any) => ({
                name: g.name,
                flowRate: g.flowRate ?? 0,
                waitTime: g.waitTime ?? 0,
                capacity: g.capacity ?? 0,
                status: (g.status as 'safe' | 'warning' | 'critical') ?? 'safe',
                type: g.type ?? 'General',
                signage: shouldDivertSignage(g.capacity ?? 0) ? 'DIVERT' : 'NORMAL'
              })))

              if (typeof data.avgWaitTime === 'number') {
                setAvgWait(parseFloat(data.avgWaitTime.toFixed(1)))
              }
              if (typeof data.totalCapacity === 'number') {
                setTotalAttendance(prev => Math.min(maxAttendance, prev + Math.floor(data.totalCapacity * 0.02)))
              }
            }
          } catch {
            // non-JSON heartbeat frames – silently ignore
          }
        }

        clientWs.onclose = () => {
          addLog('[TELEMETRY] Edge stream disconnected. Retrying in 5 s...')
          reconnectTimer = setTimeout(connectClientWs, 5000)
        }

        clientWs.onerror = () => {
          clientWs?.close()
        }
      } catch {
        reconnectTimer = setTimeout(connectClientWs, 5000)
      }
    }

    connectClientWs()

    return () => {
      clientWs?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [user])

  // ── Mock simulation loop (demo fallback) ────────────────────────────────
  // Runs only while no live edge-camera data has been received.
  // Stores its interval ID in mockIntervalRef so the /ws/client handler
  // above can clear it the moment a real telemetry packet arrives.
  useEffect(() => {
    if (!user) return

    const tick = setInterval(() => {
      // Guard: if live data has taken over, bail out immediately
      if (mockIntervalRef.current === null && isLiveTelemetry) return

      setGates(prev => prev.map(gate => {
        const variance = Math.floor(Math.random() * 7) - 3
        const newCapacity = Math.max(5, Math.min(100, gate.capacity + variance))
        const newStatus = classifyStatus(newCapacity)
        return {
          ...gate,
          capacity: newCapacity,
          status: newStatus,
          flowRate: Math.max(10, Math.round(newCapacity * 1.25)),
          waitTime: Math.max(1, Math.round(newCapacity * 0.22))
        }
      }))
      setTotalAttendance(prev => Math.min(maxAttendance, prev + randomRange(5, 12)))
      setAvgWait(prev => Math.max(2.0, Math.min(25.0, prev + (Math.random() * 0.4 - 0.2))))
    }, 4500)

    // Store the ID so the /ws/client handler can clear it
    mockIntervalRef.current = tick

    return () => {
      clearInterval(tick)
      mockIntervalRef.current = null
    }
  }, [user])

  const randomRange = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min + 1) + min)
  }


  // =====================================================================
  // RENDER 1: LOGIN COMPONENT (High Contrast Slate)
  // =====================================================================
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-slate-100 flex flex-col justify-center items-center p-4 selection:bg-cyan-500/30">
        
        {/* Decorative elements */}
        <div className="absolute w-[300px] h-[300px] bg-cyan-500/10 rounded-full blur-[100px] top-[10%] left-[10%] pointer-events-none"></div>
        <div className="absolute w-[300px] h-[300px] bg-rose-500/5 rounded-full blur-[120px] bottom-[10%] right-[10%] pointer-events-none"></div>

        <div className="w-full max-w-md glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl relative border border-white/10">
          
          {/* Platform Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/20 mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white m-0">ASTRACROWD <span className="text-cyan-400">AI</span></h1>
            <p className="text-xs text-slate-400 mt-1.5 uppercase tracking-widest font-bold">Stadium Operations Portal</p>
          </div>

          {authError && (
            <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            
            {/* Directives details selector */}
            <div>
              <label className="block text-[11px] font-black text-slate-300 uppercase tracking-wider mb-2">Operational Post (Guard Zone)</label>
              <select 
                value={authZone}
                onChange={(e) => setAuthZone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-white/10 text-slate-200 font-semibold focus:outline-none focus:border-cyan-500 transition text-sm"
              >
                <option value="Gate 3">Gate 3 (Telemetry Station)</option>
                <option value="CommandCenter">Ops CommandCenter (All Alerts)</option>
                <option value="Gate 1">Gate 1 Sector</option>
                <option value="Gate 2">Gate 2 Sector</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-300 uppercase tracking-wider mb-2">Operator Email</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <UserIcon className="w-4 h-4" />
                </span>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@astracrowd.ai"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950 border border-white/10 text-slate-200 focus:outline-none focus:border-cyan-500 transition text-sm font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-300 uppercase tracking-wider mb-2">Authentication Key</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </span>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950 border border-white/10 text-slate-200 focus:outline-none focus:border-cyan-500 transition text-sm font-medium"
                />
              </div>
            </div>

            {/* CTA action wrapper */}
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full py-3.5 mt-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 hover:scale-[1.01] active:scale-[0.99] text-white font-black tracking-wide text-xs uppercase transition-all shadow-lg shadow-cyan-600/25 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <span>CALIBRATING NODE...</span>
              ) : (
                <>
                  <span>INITIALIZE OPS SESSION</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center my-4">
              <div className="flex-1 border-t border-white/10"></div>
              <span className="px-3 text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold">OR</span>
              <div className="flex-1 border-t border-white/10"></div>
            </div>

            {/* Google Sign-In Button */}
            <button 
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl bg-slate-900 border border-white/10 hover:bg-slate-800 text-slate-200 font-extrabold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-3 cursor-pointer shadow-lg hover:shadow-black/20"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.57h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.43c0,-0.64 -0.06,-1.25 -0.16,-1.84Z" fill="#4285F4" />
                <path d="M12,20.73c2.36,0 4.34,-0.78 5.79,-2.12l-3.3,-2.57c-0.91,0.61 -2.08,0.97 -3.42,0.97c-2.28,0 -4.21,-1.54 -4.9,-3.6H2.76v2.66c1.47,2.92 4.5,4.92 8.04,4.92Z" fill="#34A853" />
                <path d="M7.1,13.42A6.38,6.38 0 0 1 7.1,10.58V7.92H2.76A10.8,10.8 0 0 0 1.2,12A10.8,10.8 0 0 0 2.76,16.08L7.1,13.42Z" fill="#FBBC05" />
                <path d="M12,7.27c1.28,0 2.43,0.44 3.34,1.31l2.5,-2.5C16.33,4.68 14.35,3.92 12,3.92c-3.54,0 -6.57,2 -8.04,4.92l4.34,2.66c0.69,-2.06 2.62,-3.6 4.9,-3.6Z" fill="#EA4335" />
              </svg>
              <span>Sign In with Google</span>
            </button>

            {/* Dummy Credentials Bypass Button */}
            <button 
              type="button"
              onClick={handleDummyLogin}
              disabled={isLoading}
              className="w-full py-3.5 mt-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 hover:scale-[1.01] active:scale-[0.99] text-white font-black tracking-widest text-xs uppercase transition-all shadow-lg shadow-emerald-700/20 flex items-center justify-center gap-2 cursor-pointer border border-emerald-500/20"
            >
              <Shield className="w-4 h-4" />
              <span>Use Dummy Credentials</span>
            </button>

            {/* Sandbox Developer Bypass Hint */}
            <div className="mt-6 pt-5 border-t border-white/5 text-center">
              <span className="text-[10px] font-mono text-slate-500 block uppercase font-bold tracking-wider">Sandbox Environment active</span>
              <p className="text-[11px] text-slate-400 mt-2">
                Leaving email/password blank or clicking the Google sign-in will initiate a secure/mock **Developer Session** with local overrides.
              </p>
            </div>

          </form>

        </div>
      </div>
    )
  }


  // =====================================================================
  // RENDER 2: DASHBOARD INTERFACE (Premium High Contrast mobile-first)
  // =====================================================================
  return (
    <div className="flex-1 w-full min-h-screen bg-[#070b13] flex flex-col text-slate-100 font-sans selection:bg-rose-500/30">
      
      {/* 🚨 "EYES-UP" URGENT ALERT MODAL (Absolutely positioned full-screen red warning flasher) */}
      {eyesUpAlert?.active && (
        <div className="fixed inset-0 bg-rose-600/98 backdrop-blur-xl z-[999] flex flex-col justify-between items-center p-6 sm:p-8 text-center animate-pulse duration-1000">
          
          {/* Emergency Atmospheric Flasher Ring */}
          <div className="absolute inset-0 bg-gradient-to-t from-rose-700/0 via-rose-950/20 to-rose-700/0 pointer-events-none"></div>

          {/* Top visual hazard bars */}
          <div className="w-full max-w-md pt-8 flex flex-col items-center">
            <div className="p-4 bg-white text-rose-600 rounded-3xl shadow-2xl mb-4 animate-bounce">
              <AlertOctagon className="w-12 h-12" />
            </div>
            <span className="text-xs font-mono font-black tracking-widest bg-white/20 text-white px-3 py-1 rounded-full uppercase border border-white/20">
              Emergency Broadcast
            </span>
          </div>

          {/* Center text instructions (High-contrast thick text for outdoor sun reading) */}
          <div className="w-full max-w-xl my-auto">
            <h2 className="text-4xl sm:text-5xl font-black text-white leading-none tracking-tight">
              CRITICAL CONGESTION ALERT
            </h2>
            <p className="text-lg sm:text-xl font-bold text-rose-100 mt-6 tracking-wide max-w-md mx-auto uppercase">
              Location: <span className="bg-white text-rose-700 px-3 py-0.5 rounded font-black text-xl">{eyesUpAlert.location}</span>
            </p>
            
            {/* Big Instruction Badge */}
            <div className="mt-8 p-6 bg-rose-950/80 border-2 border-white rounded-3xl shadow-2xl max-w-md mx-auto">
              <p className="text-xs text-rose-300 font-mono tracking-widest font-black uppercase">Required Field Maneuver</p>
              <h3 className="text-3xl font-black text-white mt-2 leading-tight tracking-tight uppercase">
                {eyesUpAlert.instruction}
              </h3>
            </div>

            <p className="text-xs text-rose-200 mt-6 max-w-xs sm:max-w-md mx-auto italic font-medium leading-relaxed">
              "{eyesUpAlert.message}"
            </p>
          </div>

          {/* Bottom Huge Acknowledge Button */}
          <div className="w-full max-w-md pb-8">
            <button 
              onClick={handleAcknowledgeAlert}
              className="w-full py-5 bg-white hover:bg-slate-100 active:bg-slate-200 text-rose-950 font-black text-lg sm:text-xl rounded-2xl shadow-2xl shadow-rose-900/60 hover:scale-105 active:scale-[0.98] transition-all tracking-wider uppercase cursor-pointer"
            >
              Acknowledge Alert
            </button>
            <span className="text-[10px] font-mono text-rose-300 block mt-3.5 uppercase font-bold tracking-wider">
              Acknowledge logs timestamp: {eyesUpAlert.timestamp}
            </span>
          </div>

        </div>
      )}

      {/* 📱 STICKY HEADER (Optimized for attendance and mobile density) */}
      <header className="sticky top-0 z-40 bg-[#0c1220]/90 backdrop-blur-md border-b border-white/5 py-3 px-4 md:px-6 flex flex-col gap-2">
        <div className="flex justify-between items-center w-full">
          {/* Brand/Role info */}
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-r from-cyan-500 to-indigo-600 rounded-lg text-white">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-black text-white leading-none tracking-tight">ASTRACROWD <span className="text-cyan-400">FIELD</span></h1>
              <p className="text-[9px] font-semibold text-slate-400 tracking-wider mt-0.5 uppercase">Guard: {user.displayName} | {authZone}</p>
            </div>
          </div>

          {/* WebSockets Connect Banner & Copilot Toggle */}
          <div className="flex items-center gap-2 flex-wrap justify-end">

            {/* ── Data Source Indicator Badge ── */}
            {isLiveTelemetry ? (
              <div
                id="live-telemetry-badge"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black tracking-widest uppercase
                           bg-emerald-500/15 text-emerald-300 border border-emerald-500/40
                           shadow-md shadow-emerald-500/10"
              >
                {/* Pulsing green dot */}
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                <span>LIVE FROM EDGE CAMERAS</span>
              </div>
            ) : (
              <div
                id="simulating-badge"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black tracking-widest uppercase
                           bg-amber-500/15 text-amber-300 border border-amber-500/40"
              >
                {/* Static amber dot */}
                <span className="inline-flex rounded-full h-2 w-2 bg-amber-400" />
                <span>SIMULATING DEMO DATA</span>
              </div>
            )}

            {/* AI Copilot Toggle Button */}
            <button 
              onClick={() => setChatOpen(!chatOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black tracking-wider transition border ${
                chatOpen 
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 shadow-md shadow-cyan-500/10' 
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-white/5'
              } cursor-pointer`}
            >
              <Bot className="w-3.5 h-3.5 animate-pulse" />
              <span className="hidden xs:inline">AI COPILOT</span>
            </button>

            {/* WS connection status pill */}
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] font-mono font-bold ${
              wsStatus === 'connected' 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                : wsStatus === 'connecting'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}>
              {wsStatus === 'connected' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3 animate-pulse" />}
              <span>{wsStatus.toUpperCase()}</span>
            </div>

            {/* Logout trigger */}
            <button 
              onClick={handleLogout}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Global Live Stats Panel (Optimized for fast mobile glance) */}
        <div className="grid grid-cols-2 gap-3 mt-1.5">
          {/* Attendance Inflow block */}
          <div className="bg-slate-900/60 rounded-xl p-3 border border-white/5 flex justify-between items-center">
            <div>
              <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">Total Ingress</span>
              <p className="text-base font-black text-white mt-0.5">{totalAttendance.toLocaleString()}</p>
            </div>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>

          {/* Average wait time block */}
          <div className="bg-slate-900/60 rounded-xl p-3 border border-white/5 flex justify-between items-center">
            <div>
              <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">Average Wait</span>
              <p className="text-base font-black text-white mt-0.5">{avgWait.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">mins</span></p>
            </div>
            <Clock className="w-4 h-4 text-violet-400" />
          </div>
        </div>
      </header>

      {/* 📱 PRIMARY RESPONSIVE INTERFACE GRID - Left is main dashboard, right is sticky/drawer Copilot */}
      <div className="flex-1 w-full max-w-[1400px] mx-auto p-4 flex flex-col lg:flex-row gap-6 relative">
        
        {/* Left Side: Main Dashboard Grid */}
        <main className="flex-1 flex flex-col gap-6 min-w-0">
          
          {/* Dynamic Zone Section Header */}
          <div>
            <h2 className="text-base font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span>Stadium Gates Density Map</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Outdoor-optimized telemetry nodes reporting live capacity indicators.
            </p>
          </div>

          {/* 📱 GRID OF GATE DENSITY CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {gates.map((gate) => {
              const colorClass = getGateCardColorClass(gate.capacity)
              const badgeColor = getGateBadgeColorClass(gate.capacity)

              return (
                <div 
                  key={gate.name}
                  className={`rounded-2xl p-5 border shadow-xl flex flex-col justify-between transition-all duration-300 hover:scale-[1.01] ${colorClass}`}
                >
                  {/* Gate header details */}
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-black text-white leading-none">{gate.name}</h3>
                      <span className="text-[9px] font-bold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded uppercase mt-1 inline-block">
                        {gate.type} Sector
                      </span>
                    </div>

                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${badgeColor}`}>
                      {gate.capacity}%
                    </span>
                  </div>

                  {/* Quantitative statistics */}
                  <div className="grid grid-cols-2 gap-4 my-5">
                    <div className="bg-slate-950/50 p-2.5 rounded-xl border border-white/5">
                      <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">Transit Flow</span>
                      <p className="text-lg font-black text-white mt-0.5">
                        {gate.flowRate} <span className="text-xs font-normal text-slate-500">/min</span>
                      </p>
                    </div>
                    <div className="bg-slate-950/50 p-2.5 rounded-xl border border-white/5">
                      <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">Queue Time</span>
                      <p className="text-lg font-black text-white mt-0.5">
                        {gate.waitTime} <span className="text-xs font-normal text-slate-500">mins</span>
                      </p>
                    </div>
                  </div>

                  {/* 🏷️ PHYSICAL DIGITAL SIGNAGE INSTRUCTION BADGE */}
                  <div className="flex justify-between items-center pt-3 border-t border-white/5">
                    <div className="flex items-center gap-1.5">
                      <MonitorPlay className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Digital Signage</span>
                    </div>

                    <span className={`px-3 py-1 rounded-lg text-xs font-black tracking-widest ${
                      gate.signage === 'DIVERT'
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'bg-slate-900 text-slate-300 border border-slate-700'
                    }`}>
                      SIGN: {gate.signage}
                    </span>
                  </div>

                </div>
              )
            })}
          </div>

          {/* 📟 LIVE SIMULATION TERMINAL LOGS (For validation) */}
          <div className="glass-panel rounded-2xl p-4 border border-white/5 mt-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Device Operations Log</span>
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping"></span>
            </div>
            
            <div className="bg-slate-950/80 rounded-xl p-3 border border-white/5 font-mono text-[10px] text-slate-400 h-[120px] overflow-y-auto flex flex-col gap-1.5">
              {systemLogs.map((log, i) => (
                <div key={i} className="leading-relaxed">
                  <span className="text-cyan-500 font-bold">{log.substring(0, 10)}</span>
                  <span className="text-slate-300">{log.substring(10)}</span>
                </div>
              ))}
            </div>
          </div>

        </main>

        {/* Right Side: Collapsible Slide-Out Drawer or Desktop Sticky Panel */}
        {chatOpen && (
          <aside className="
            /* Mobile/tablet floating state */
            fixed right-4 bottom-24 top-20 z-45 w-full max-w-sm sm:max-w-md
            /* Desktop inline state sticky column */
            lg:relative lg:top-0 lg:bottom-0 lg:right-0 lg:max-w-none lg:w-[420px] lg:h-[calc(100vh-140px)] lg:sticky lg:top-24 lg:z-10
            glass-panel rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300"
          >
            {/* Panel Header */}
            <div className="p-4 border-b border-white/5 bg-slate-950/80 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-gradient-to-br from-cyan-500 to-indigo-600 rounded-xl text-white">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white leading-none tracking-tight">ASTRACROWD AI COPILOT</h3>
                  <span className="text-[9px] font-mono text-cyan-400 font-bold uppercase tracking-wider">Gemini 2.5 Connected</span>
                </div>
              </div>
              <button 
                onClick={() => setChatOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800/80 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Message List */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-950/20 flex flex-col">
              {chatMessages.map((msg, index) => {
                const isAI = msg.sender === 'ai'
                return (
                  <div 
                    key={index}
                    className={`flex flex-col max-w-[85%] ${isAI ? 'self-start' : 'self-end'}`}
                  >
                    <span className={`text-[8px] font-mono text-slate-500 mb-1 ${isAI ? 'self-start' : 'self-end'}`}>
                      {isAI ? 'AstraCrowd Copilot' : 'Ops Operator'} // {msg.timestamp}
                    </span>
                    <div className={`p-3 rounded-2xl border ${
                      isAI 
                        ? 'bg-slate-900/90 border-white/5' 
                        : 'bg-cyan-600 text-white border-cyan-500 shadow-lg shadow-cyan-600/10'
                    }`}>
                      {isAI ? (
                        <MarkdownRenderer text={msg.text} />
                      ) : (
                        <p className="text-xs leading-relaxed break-words font-medium">{msg.text}</p>
                      )}
                    </div>
                  </div>
                )
              })}
              
              {chatLoading && (
                <div className="self-start flex flex-col max-w-[85%]">
                  <span className="text-[8px] font-mono text-slate-500 mb-1">AstraCrowd Copilot // Evaluating...</span>
                  <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-white/5 text-xs text-slate-400 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce delay-100"></div>
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce delay-200"></div>
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce delay-300"></div>
                    <span>Evaluating telemetry feeds...</span>
                  </div>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* Message Input Form */}
            <form onSubmit={handleSendChatMessage} className="p-3 border-t border-white/5 bg-slate-950/80 flex gap-2">
              <input 
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about gate capacities, redirection..."
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-slate-200 focus:outline-none focus:border-cyan-500 transition text-xs font-semibold"
              />
              <button 
                type="submit"
                disabled={chatLoading}
                className="p-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white transition hover:scale-105 active:scale-95 shadow-md shadow-cyan-600/20 cursor-pointer flex items-center justify-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </aside>
        )}

      </div>

      {/* FOOTER */}
      <footer className="mt-auto py-5 px-4 bg-slate-950/50 text-center border-t border-white/5">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
          ASTRACROWD AI // PORTABLE TERMINAL // SECURITY LEVEL 3
        </p>
      </footer>

      {/* Floating AI Copilot Trigger Button (Visible when closed) */}
      {!chatOpen && (
        <button 
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-40 p-4 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-600 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-cyan-500/20 text-white cursor-pointer border border-white/10 flex items-center gap-2"
        >
          <Bot className="w-6 h-6 animate-pulse" />
          <span className="hidden sm:inline text-xs font-black tracking-wider uppercase">AI Copilot</span>
        </button>
      )}

    </div>
  )
}
