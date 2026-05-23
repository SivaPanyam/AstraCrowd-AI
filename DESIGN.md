# AstraCrowd AI: Design System Specification

Welcome to the **AstraCrowd AI Design System**. This document serves as the single source-of-truth for building the user interfaces of the real-time stadium crowd intelligence platform.

---

## 1. Design Philosophy
AstraCrowd AI operates in high-intensity, mission-critical environments (stadium operations centers). The UI must support **rapid cognitive processing**, **high visual hierarchy**, and **immediate situational awareness**.
- **Aesthetic**: Futuristic, high-contrast dark-mode dashboard (cyberpunk/high-tech telemetry look).
- **Visual Depth**: Glassmorphic panels with subtle neon borders, providing separation of concerns without heavy solid blocks.
- **Animation**: Dynamic micro-animations (pulsing status dots, smooth progress bars, slide-in alerts) to draw attention to anomalies instantly.

---

## 2. Color Palette

Our colors are designed to maximize readability under low-light control room environments while highlighting critical status changes.

### Core Brand Colors
| Token | Hex Value | Visual Use |
| :--- | :--- | :--- |
| `Bg-Primary` | `#0b0f19` | Main background of the dashboard |
| `Bg-Secondary` | `#111827` | Solid sections (headers, toolbars) |
| `Surface-Card` | `rgba(17, 24, 39, 0.7)` | Glassmorphic widgets & containers |
| `Text-Primary` | `#f8fafc` | Title, metrics, and core readable content |
| `Text-Secondary` | `#94a3b8` | Subtext, labels, and metadata |
| `Border-Muted` | `rgba(255, 255, 255, 0.08)` | Default card border |

### Status & Accents (High Contrast)
| Token | Hex Value | Status/Meaning | CSS Styling |
| :--- | :--- | :--- | :--- |
| `Color-Safe` | `#10b981` | Optimal flow, low congestion | Emerald-500, pulsing glow |
| `Color-Warning` | `#f59e0b` | Elevated density, moderate congestion | Amber-500 |
| `Color-Critical` | `#f43f5e` | Extreme crowd density, gate bottleneck | Rose-500, active flashing |
| `Color-Cyan` | `#06b6d4` | Data telemetry streams, standard gate | Cyan-500 |
| `Color-Purple` | `#8b5cf6` | VIP / Express lane operations | Violet-500 |

---

## 3. Typography Scale

Using **Inter** or standard system-ui sans-serif fonts to ensure clarity at all text sizes.

| Type Role | Font Size | Font Weight | Tracking | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `Display-Hero` | `2.25rem` (36px) | 800 (ExtraBold) | `-0.05em` | Main titles / Global counts |
| `Metric-Huge` | `3.00rem` (48px) | 900 (Black) | `-0.02em` | Digital readouts, percentages |
| `Heading-Medium` | `1.50rem` (24px) | 700 (Bold) | `-0.01em` | Section / Widget titles |
| `Heading-Small` | `1.125rem` (18px) | 600 (SemiBold) | `0` | Card titles, action labels |
| `Body-Regular` | `1.00rem` (16px) | 400 (Regular) | `0` | Standard descriptions, tables |
| `Caption-Mono` | `0.875rem` (14px) | 500 (Medium) | `0.05em` | System logs, terminal outputs |

---

## 4. Spacing & Layout Rules

Built on a strict **4px grid system** (Tailwind spacing scale) to preserve dashboard density and clean alignment.

- **Grid Layout**: 12-column responsive layout, collapsing to 1-column on mobile.
- **Card Padding**: `p-6` (24px) for desktop widget blocks; `p-4` (16px) for compact listings.
- **Inter-widget Gap**: `gap-6` (24px) to balance density with breathing room.
- **Border Radius**:
  - Outer Containers / Widgets: `rounded-2xl` (16px)
  - Inner Buttons / Inputs: `rounded-lg` (8px)

---

## 5. Premium Component Patterns

### A. Dynamic Gate Cards
Gate cards represent physical entryways. They display inflow statistics, current queue time, and an active density meter.

- **Structure**:
  - Header: Gate Name, Active Status Indicator (Safe/Warning/Critical).
  - Main Body: Digital readout of "Flow Rate" (people/min) and "Queue Wait Time" (mins).
  - Footer: Progress Bar representing current gate capacity percentage.
- **Dynamic Transition Rules**:
  - **Low Density (<60%)**: Safe Green border (`border-emerald-500/20`), green telemetry bar.
  - **Medium Density (60%-85%)**: Warning Orange border (`border-amber-500/40`), orange queue indicator.
  - **High Density (>85%)**: Critical Red pulsing glow (`border-rose-500/80 animate-pulse`), warning banner.

```html
<!-- Example Gate Card Structure -->
<div class="relative bg-slate-900/70 backdrop-blur-md border border-emerald-500/20 rounded-2xl p-6 shadow-xl">
  <div class="flex justify-between items-center mb-4">
    <h3 class="text-lg font-bold text-slate-100">Gate Alpha</h3>
    <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400">Optimal</span>
  </div>
  <div class="grid grid-cols-2 gap-4 mb-4">
    <div>
      <p class="text-xs text-slate-400">Flow Rate</p>
      <p class="text-2xl font-black text-slate-100">42 <span class="text-xs font-normal text-slate-500">/min</span></p>
    </div>
    <div>
      <p class="text-xs text-slate-400">Wait Time</p>
      <p class="text-2xl font-black text-slate-100">3 <span class="text-xs font-normal text-slate-500">mins</span></p>
    </div>
  </div>
  <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
    <div class="bg-emerald-500 h-full" style="width: 35%"></div>
  </div>
</div>
```

### B. High-Contrast Alert Overlays (Incident Alerts)
Critical safety alerts occupy a persistent, top-tier z-index position or an overlay panel with high visual contrast.

- **Aesthetic**: Glassmorphic dark slate with broad, neon Crimson/Rose left border. Includes a flashing notification bell and dynamic uvicorn/websockets trigger timestamp.
- **Typography**: Displayed in stark `text-rose-400` with high-luminance white body text.
- **Action Buttons**: Fast dismiss (`border border-slate-700 hover:bg-slate-800`) and emergency redirect protocol trigger.

```html
<!-- Example Alert Overlay -->
<div class="flex items-start gap-4 p-4 bg-slate-950/90 border-l-4 border-rose-500 rounded-r-xl shadow-2xl backdrop-blur-lg">
  <div class="p-2 bg-rose-500/10 text-rose-500 rounded-lg animate-bounce">
    <svg>...</svg>
  </div>
  <div class="flex-1">
    <h4 class="text-sm font-bold text-rose-400">GATE BOTTLENECK: GATE CHARLIE</h4>
    <p class="text-xs text-slate-200 mt-1">Ingress rate exceeds critical threshold of 120 people/min. Automated redirect to Gate Delta suggested.</p>
    <div class="flex gap-2 mt-3">
      <button class="px-3 py-1 text-xs bg-rose-600 hover:bg-rose-500 text-white rounded font-medium transition">Deploy Redirect</button>
      <button class="px-3 py-1 text-xs border border-slate-700 hover:bg-slate-800 text-slate-300 rounded font-medium transition">Dismiss</button>
    </div>
  </div>
</div>
```

---

## 6. Implementation Guidelines
- **Tailwind Integration**: All styles should utilize standard utility classes where possible, supplemented by custom glassmorphism layers (`backdrop-blur-md`, custom shadow configurations).
- **Dark Mode Standard**: All designs are dark-mode first. Light mode is not supported in the standard operational dashboard.
