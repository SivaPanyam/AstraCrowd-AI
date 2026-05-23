import { useState, useEffect, useRef } from 'react'
import { initializeApp } from 'firebase/app'
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut
} from 'firebase/auth'
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
  MonitorPlay
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
      
      // Select appropriate protocol based on location (WSS support)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//localhost:8000/ws/alerts?token=${token}&zone=${zone}`
      
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

  // Manual Trigger to Simulate Telemetry updates (Sinusoid Noise loop)
  useEffect(() => {
    if (!user) return

    const tick = setInterval(() => {
      setGates(prev => prev.map(gate => {
        // Continuous flow variations for realism
        const variance = Math.floor(Math.random() * 7) - 3
        const newCapacity = Math.max(5, Math.min(100, gate.capacity + variance))
        
        let newStatus: 'safe' | 'warning' | 'critical' = 'safe'
        if (newCapacity > 80) newStatus = 'critical'
        else if (newCapacity >= 50) newStatus = 'warning'
        
        return {
          ...gate,
          capacity: newCapacity,
          status: newStatus,
          flowRate: Math.max(10, Math.round(newCapacity * 1.25)),
          waitTime: Math.max(1, Math.round(newCapacity * 0.22))
        }
      }))

      // Increment attendance and wait times
      setTotalAttendance(prev => Math.min(maxAttendance, prev + randomRange(5, 12)))
      setAvgWait(prev => Math.max(2.0, Math.min(25.0, prev + (Math.random() * 0.4 - 0.2))))
    }, 4500)

    return () => clearInterval(tick)
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

            {/* Sandbox Developer Bypass Hint */}
            <div className="mt-6 pt-5 border-t border-white/5 text-center">
              <span className="text-[10px] font-mono text-slate-500 block uppercase font-bold tracking-wider">Sandbox Environment active</span>
              <p className="text-[11px] text-slate-400 mt-2">
                Leaving email/password blank will initiate a mock **Developer Bypass Session** with local node overrides.
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

          {/* WebSockets Connect Banner */}
          <div className="flex items-center gap-3">
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

      {/* 📱 PRIMARY INTERFACE GRID */}
      <main className="flex-1 w-full max-w-[1000px] mx-auto p-4 flex flex-col gap-6">

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
            const isYellow = gate.capacity >= 50 && gate.capacity <= 80
            const isRed = gate.capacity > 80

            // Custom color configs with high-contrast text tags for outdoor sun visibility
            const colorClass = isRed 
              ? 'bg-rose-950/80 border-rose-500 shadow-rose-950/20' 
              : isYellow 
                ? 'bg-amber-950/60 border-amber-500 shadow-amber-950/10' 
                : 'bg-emerald-950/40 border-emerald-500/80 shadow-emerald-950/10'

            const badgeColor = isRed 
              ? 'bg-rose-500 text-white font-bold' 
              : isYellow 
                ? 'bg-amber-500 text-slate-950 font-black' 
                : 'bg-emerald-500 text-white font-bold'

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

      {/* FOOTER */}
      <footer className="mt-auto py-5 px-4 bg-slate-950/50 text-center border-t border-white/5">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
          ASTRACROWD AI // PORTABLE TERMINAL // SECURITY LEVEL 3
        </p>
      </footer>

    </div>
  )
}
