# ClassCast 🎓

> **Offline-first classroom collaboration, screen-sharing, attendance, and interaction platform designed for local Wi-Fi and mobile hotspots.**

ClassCast enables educators and students to interact seamlessly in offline environments without active internet connectivity. A teacher can host a classroom session on a laptop, share their screen via low-latency WebRTC, take digital attendance, and chat with students—all over a standard smartphone mobile hotspot or local area network.

---

## 🌟 Key Features

* **Offline-First Collaboration:** Works completely offline without cloud servers or internet access.
* **Low-Latency Screen Sharing:** Peer-to-peer WebRTC video stream directly between the presenter and participants.
* **Instant QR Code Joining:** Students scan a dynamically generated QR code or open a local IP URL in their smartphone browser.
* **Attendance Tracking:** Real-time participant logging with single-click CSV attendance export.
* **Interactive Classroom Tools:** In-session chat, raise-hand notifications, and host-managed permissions.
* **Cross-Platform:** Runs on Linux, Windows, and macOS via portable launchers or an Electron desktop application.

---

## 🏗️ Architecture & Technology Stack

ClassCast is organized as a lightweight TypeScript monorepo using npm workspaces:

```
CLASSCAST/
├── packages/
│   └── shared/          # TypeScript contracts, validation, protocol definitions
├── server/              # Express backend, WebSocket signaling server, QR generator
├── web/                 # React 19 + TypeScript + Vite + Tailwind CSS frontend (PWA)
├── electron/            # Electron desktop integration & process lifecycle manager
├── Start_ClassCast.sh   # One-click portable launcher for Linux & macOS
├── Start_ClassCast.bat  # One-click portable launcher for Windows
└── ClassCast.desktop    # Desktop shortcut for Linux desktop environments
```

* **Frontend:** React 19, React Router 7, Vite 6, Tailwind CSS.
* **Backend:** Node.js, Express, `ws` (WebSocket server), `qrcode`.
* **Media & Signaling:** WebRTC mesh orchestration with custom WebSocket signaling for offers, answers, ICE candidates, and session events.

---

## 🚀 Quick Start Guide

### Prerequisites
* **Node.js:** Version 20 or newer ([nodejs.org](https://nodejs.org/)).
* **npm:** Included with Node.js.

### 1. Launch with One-Click Launchers (Recommended)

#### On Windows:
Double-click `Start_ClassCast.bat` (or open Command Prompt):
```cmd
Start_ClassCast.bat
```
*Automatically verifies Node.js, installs dependencies, builds packages if missing, boots the server, and launches your browser to `http://localhost:3000`.*

#### On Linux / macOS:
Open a terminal in the project directory and run:
```bash
chmod +x Start_ClassCast.sh
./Start_ClassCast.sh
```
*Alternatively on Linux, you can double-click `ClassCast.desktop`.*

---

### 2. Manual CLI Workflow

If you prefer using standard npm commands:

```bash
# 1. Install workspace dependencies
npm install

# 2. Build shared, server, and web packages
npm run build

# 3. Run test suites
npm test

# 4. Start production server
npm start
```
The server will start on port `3000` and display your local and network IP addresses.

---

### 3. Electron Desktop App

To run the application inside an Electron window:

```bash
# Run desktop development build
npm run desktop:dev

# Package Linux binary (AppImage/Snap)
npm run desktop:build
```

> **Note on Standalone Packaging:**
> * Standalone binaries (`.exe` on Windows, `.AppImage` on Linux, `.dmg` on macOS) bundle Node.js and Chromium, allowing users without Node.js installed to run the application.
> * Due to platform signing and native toolchains, Windows `.exe` installers must be built on Windows (or via wine), and macOS `.dmg` packages must be built on macOS.

---

## 📱 Mobile Hotspot & Local Area Network Setup

ClassCast is specifically designed to function when devices are connected to a personal mobile hotspot.

### Step-by-Step Hotspot Instructions:
1. **Turn on Mobile Hotspot** on your smartphone.
2. **Connect your laptop** (the teacher's computer) to the smartphone's Wi-Fi hotspot.
3. Launch ClassCast (`./Start_ClassCast.sh` or `Start_ClassCast.bat`).
4. Look at the terminal output or the **ClassCast** homepage:
   * It will show: `Network: http://<YOUR_HOTSPOT_IP>:3000` (e.g. `http://192.168.43.15:3000`).
5. Click **Start Class** to host a session.
6. **For Students:**
   * Ensure students' smartphones are connected to the **same Wi-Fi hotspot**.
   * Open the phone camera or browser and navigate to `http://<YOUR_HOTSPOT_IP>:3000` or scan the QR code displayed on the teacher's screen.
   * Enter Student Name and Roll Number, then tap **Join**.

---

## ⚠️ Network, Firewall & Browser Security Limitations

### 1. Browser Media Permissions (HTTP vs. HTTPS)
* **Screen Sharing from Host (Laptop):** The teacher accesses `http://localhost:3000`. Modern browsers treat `localhost` as a secure origin, allowing full `getDisplayMedia` screen sharing and microphone access without SSL certificates.
* **Remote Mobile Devices over LAN:** When students connect to `http://192.168.x.x:3000`, browsers consider standard HTTP an insecure origin. Students can **view** the shared screen and **chat** freely; however, browser security policies strictly block student microphone access and student screen sharing unless the connection is HTTPS.

### 2. Mobile Hotspot Client Isolation (AP Isolation)
* Some smartphone hotspot settings or university enterprise Wi-Fi routers have "AP Isolation" or "Client Isolation" turned on. This prevents connected devices from communicating directly with each other.
* **Fix:** If students cannot open `http://<IP>:3000`, check the hotspot configuration on the phone and disable "AP Isolation" or "Guest Network Isolation".

### 3. Operating System Firewalls
* On Windows, when Node or Electron starts for the first time, Windows Defender Firewall may display a security alert. You must select **"Allow access"** on Private networks.
* On Linux, ensure port 3000 is open if using `ufw`:
  ```bash
  sudo ufw allow 3000/tcp
  ```

---

## 🧪 Verification & Automated Tests

To verify project integrity:

```bash
# Typecheck across all workspace projects
npx tsc --noEmit --project packages/shared/tsconfig.json
npx tsc --noEmit --project server/tsconfig.json
npx tsc --noEmit --project web/tsconfig.json

# Run unit and protocol tests
npm test
```

---

## 📄 License

MIT License. Designed for classroom and educational collaboration.
