# ClassCast 🎓✨

> **No Wi-Fi? Zero data? No cap, we got you.**  
> An offline-first, peer-to-peer classroom collaboration hub that turns any phone hotspot or LAN into an interactive lecture hall. Screen sharing, live attendance, real-time chat—running **100% locally**.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite_6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![WebRTC](https://img.shields.io/badge/WebRTC-333333?style=for-the-badge&logo=webrtc&logoColor=white)](https://webrtc.org/)
[![Electron](https://img.shields.io/badge/Electron_44-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

---

## ⚡ The TL;DR: Why Does This Exist?

Picture this: your classroom Wi-Fi is down, cellular data is non-existent in the basement lecture hall, or you're running a tech workshop in a dead zone. Traditional tools like Zoom, Teams, or Google Meet immediately crash and burn because they rely on cloud servers and internet pipes.

**ClassCast hits different:**
* 📶 **Runs over a phone hotspot** — zero internet bytes consumed.
* 🖥️ **Crisp, sub-second screen sharing** beamed straight from teacher laptop to student phones.
* 📲 **Scan & join instantly** — students just scan a QR code on the projector or blackboard. No app download needed (it's a clean PWA).
* 📋 **One-click attendance export** — teacher downloads clean CSVs in seconds.
* 🔒 **Completely private & local** — student data and video frames never leave your local room.

---

## 🧰 The Tech Stack Breakdown (Under The Hood)

We didn't just throw things together; every tool in this monorepo was hand-picked for speed, reliability, and offline autonomy:

```
CLASSCAST/
├── packages/
│   └── shared/          # 📦 Source of Truth: shared types, protocol validation, constants
├── server/              # ⚙️ Node.js + Express backend + WebSocket signaling hub
├── web/                 # ⚡ React 19 + Vite 6 + Tailwind CSS frontend (PWA)
├── electron/            # 💻 Electron desktop wrapper & background daemon orchestrator
├── Start_ClassCast.sh   # 🚀 One-click launcher (Linux & macOS)
├── Start_ClassCast.bat  # 🚀 One-click launcher (Windows)
└── ClassCast.desktop    # 🐧 Desktop shortcut entry for Linux
```

### 1. 🌐 The Frontend: React 19 + Vite 6 + Tailwind CSS
* **React 19:** Powers our ultra-reactive UI with buttery smooth transitions, modern hook management (`useMedia`, `useWebSocket`), and optimized DOM updates.
* **Vite 6:** Instant HMR in development and lightning-fast Rollup tree-shaking for production builds (~320 KB gzipped payload).
* **Tailwind CSS v3:** Clean, modern, accessible design with glassmorphism, responsive mobile cards, and intuitive lecture controls.
* **PWA (Progressive Web App):** Configured via `vite-plugin-pwa` so student browsers cache the application shell locally and launch without re-fetching static assets.

### 2. ⚡ Real-Time Engine: WebRTC + Custom WebSocket Signaling
* **Native WebRTC:** Peer-to-peer media pipeline using standard browser `RTCPeerConnection`. Once negotiated, video streams flow directly across the local Wi-Fi router or hotspot with ultra-low latency (under 50ms) and zero cloud compression artifacts.
* **WebSocket Server (`ws`):** Bi-directional, stateful message bus. Instead of polling HTTP endpoints, host and student clients exchange session status, hand raises, chat messages, and WebRTC SDP offers/answers/ICE candidates in microseconds.
* **Dynamic QR Code Engine (`qrcode`):** Encodes the active hotspot IP and classroom session token into crisp QR images on demand for instant camera onboarding.

### 3. 🛡️ The Backend: Node.js + Express
* **Express & Node.js HTTP Server:** Dual-purpose powerhouse serving our REST health/attendance endpoints while also serving the compiled single-page frontend.
* **Smart Network Adapter Discovery:** Custom algorithm in `server/src/network.ts` that inspects system network interfaces, penalizes virtual bridges (Docker, WSL, VPNs), and automatically prioritizes active wireless hotspot adapters (`192.168.x.x` / `10.x.x.x`).

### 4. 🖥️ Desktop Ecosystem: Electron 44 & electron-builder
* **Electron Wrapper:** Lets professors double-click an icon and run ClassCast without knowing what a terminal is.
* **Smart Lifecycle Orchestrator:** Polls the Express server health endpoint before loading the UI and hooks into `before-quit` to ensure background WebSocket listeners and ports release cleanly.

---

## 🚀 Quick Launch (Pick Your Poison)

### 🎒 Method 1: The One-Click Way (Easiest for Teachers & Students)

Make sure you have **Node.js (v20+)** installed on the host machine.

* **On Windows:** Double-click `Start_ClassCast.bat`.
* **On Linux / macOS:** Run in terminal:
  ```bash
  chmod +x Start_ClassCast.sh
  ./Start_ClassCast.sh
  ```
> **What it does automatically:** Checks Node/npm, installs dependencies if it's your first run, compiles TypeScript/Vite assets if missing, kicks off the server, and automatically pops open `http://localhost:3000` in your default browser. Zero stress.

---

### 💻 Method 2: For The CLI Purists

```bash
# 1. Grab dependencies across all workspaces
npm install

# 2. Build packages (shared, server, web)
npm run build

# 3. Run the automated test suites
npm test

# 4. Fire up the production server
npm start
```

---

### 🪟 Method 3: Electron Desktop App

Want it to look and feel like a dedicated native desktop application?

```bash
# Launch Electron dev app
npm run desktop:dev

# Package standalone Linux AppImage/Snap
npm run desktop:build
```

---

## 📱 Hotspot Battle Guide (Step-by-Step)

Here is how you run a live lecture over a phone hotspot:

```
[Teacher Laptop] ─────── Wi-Fi / Hotspot ─────── [Student Phones]
(Hosts on port 3000)                                (Scan QR & Join)
```

1. **Turn on Personal Hotspot** on your smartphone.
2. **Connect the teacher's laptop** to that hotspot Wi-Fi.
3. Fire up ClassCast using `Start_ClassCast.bat` or `./Start_ClassCast.sh`.
4. The terminal and host screen will show your live network URL:
   ```
   Network: http://192.168.43.15:3000
   ```
5. Click **Start Class**, type your room name, and click create.
6. **Students Join:**
   * Make sure student phones are on the **same hotspot Wi-Fi**.
   * Open the phone camera and scan the QR code on the host screen (or type the URL into Chrome/Safari).
   * Enter name & roll number ➔ tap **Join**.
7. Teacher clicks **Share Screen** ➔ Students see the live stream instantly on their phones.

---

## 🧠 Real Talk: Permissions & Network Gotchas

* **Screen Sharing & Camera Origins:**
  Modern browsers treat `http://localhost` as a **secure context**, meaning the teacher's laptop can share screens and stream video without HTTPS certificates. When students connect remotely over plain LAN IP (`http://192.168.x.x`), browser security allows them to **view** streams and chat, but blocks student microphones/screen sharing unless SSL is enabled.
* **AP / Client Isolation:**
  Some university Wi-Fi networks and Android hotspot toggles enable "Client Isolation" by default (devices on the network cannot talk to each other). If student devices cannot load the teacher's IP address, check hotspot settings and ensure connected devices can communicate.
* **Firewall Prompts:**
  When starting ClassCast for the first time on Windows, allow Node / Electron access on **Private Networks**.

---

## 🧪 Testing & Verification

ClassCast comes with automated test suites verifying ID generation, sanitization, room configs, and attendance records:

```bash
# Run unit & protocol tests across monorepo packages
npm test

# Static type check
npx tsc --noEmit --project packages/shared/tsconfig.json
npx tsc --noEmit --project server/tsconfig.json
npx tsc --noEmit --project web/tsconfig.json
```

---

## 📜 License

MIT License. Built for seamless offline education everywhere. Give it a star ⭐ if it saved your classroom presentation!

---

Crafted with 💙 by [MUSTAFA](https://mustaffa.vercel.app)

