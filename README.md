# RND Upwork Profile Optimizer

AI-powered Chrome extension that analyzes Upwork freelancer profiles across 8 key sections and provides actionable improvement recommendations. Built with a **Zero-Trust, 100% Local Privacy Architecture**.

## Features

- **8-Section Analysis** — Complete profile scoring system.
- **Multi-AI Support** — Use either **Google Gemini 1.5 Flash** or **OpenAI GPT-4o**.
- **100% Local Privacy** — No cloud storage. Your scores, profile URLs, and history never touch our servers.
- **At-Rest Encryption** — API keys, session tokens, and scan history are **encrypted using AES-GCM** on your machine.
- **Scan Cancellation** — Automatic background request termination if the sidebar is closed during a scan (saves API credits).
- **Smart Icon Display** — Extension triggers only on legitimate Upwork profile pages.
- **Score History** — Access past analyses locally, secured by disk-level encryption.

## Setup

### 1. Get an API Key
- **Gemini:** Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
- **OpenAI:** Visit [OpenAI Dashboard](https://platform.openai.com/api-keys)

### 2. Install the Extension
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (top right toggle).
3. Click **Load unpacked**.
4. Select the project folder.

### 3. Configure Settings
1. Click the extension icon in your browser toolbar.
2. Click the ⚙️ Settings icon.
3. Toggle between Gemini or OpenAI.
4. Paste your API key. (Key will be encrypted locally using your unique User ID).
5. Click **Save Settings**.

### 4. Analyze a Profile
1. Visit any Upwork freelancer profile.
2. A floating **"Analyze Profile"** button will appear in the bottom-right corner.
3. Click it to open the analysis sidebar.
4. Click **Start Analysis**.

## 8 Scoring Sections

| Section | Max Points |
|---|---|
| Profile Photo | 0.5 pts |
| Professional Title | 1.0 pts |
| Profile Overview | 2.0 pts |
| Portfolio & Project Catalog | 1.5 pts |
| Skills & Specialization | 1.0 pts |
| Work History & Social Proof | 1.5 pts |
| Rates & Availability | 0.5 pts |
| Compliance & Optimization | 1.0 pts |
| **Total** | **9.0 pts → Scaled /10** |

## Tech Stack

- **Manifest V3** — Modern Chrome Extension standards.
- **Web Crypto API** — AES-GCM 256-bit encryption for local data at rest.
- **Firebase Auth** — Secure local session management (No Firestore).
- **PDF.js** — Local parsing of resume/portfolio uploads.
- **Vanilla JS** — Performance-first, dependency-light architecture.

## Privacy & Security

- **Zero Cloud Storage:** We purged all Firestore logic. Your analysis results are never uploaded to a cloud database.
- **Data Encryption:** All sensitive fields (API keys, history, session tokens) are "scrambled" on your disk using your unique Firebase UID as a derivation secret.
- **Isolation:** Local storage is isolated to the extension; websites cannot access your data.
- **Credit Protection:** Integrated `AbortController` terminates AI requests immediately if the UI is dismissed.
