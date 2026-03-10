# RND Upwork Profile Optimizer

AI-powered Chrome extension that analyzes Upwork freelancer profiles across 8 key sections and provides actionable improvement recommendations. 

Designed for production deployment with a **Secure PHP Backend Proxy architecture** to protect AI API keys and enforce usage limits.

## Features

- **8-Section Analysis** — Complete profile scoring system (0-10 scale).
- **Multi-AI Support** — Powered by Google Gemini 1.5/2.0 and OpenAI GPT-4o on the backend.
- **Secure Architecture** — All LLM calls and Prompt Engineering logic are hidden behind a secure PHP proxy. API keys are never exposed to the Chrome Extension.
- **Trial & Usage Limits** — Tracks scans per user via Google Firebase Authentication and Firestore API, enforcing a strict 5-scan trial limit natively on the server.
- **At-Rest Encryption** — Local score history is encrypted using AES-GCM 256-bit on the user's machine.

## Architecture & Setup

This application is split into two halves: the **Chrome Extension Client** and the **PHP Server Backend**.

### 1. Setting Up the PHP Server
To securely execute AI requests and hide your API keys, you must deploy the proxy server.
1. Upload the contents of the `backend/` folder to your web server (e.g., `https://rndexperts.com/analyze`).
2. Copy `backend/config.template.php` to `backend/config.php`.
3. Fill in your `OPENAI_API_KEY` and `GEMINI_API_KEY` in `config.php`.
4. (The `.htaccess` file prevents public web access to `config.php`).

### 2. Configuring the Chrome Extension
1. Open `config/config.js`.
2. Ensure `BACKEND_URL` points to your deployed PHP server endpoint.
3. Keep `DEV_UNLIMITED_SCANS` set to `false` to enforce the 5-scan limit.

## Packaging for the Web Store

When preparing the Chrome Extension for submission to the Chrome Web Store, you **MUST exclude the backend server files and sensitive credentials**. Only the frontend extension code should be zipped.

### Packaging via Terminal (Mac/Linux)
Run this command from the root of the project repository to package securely:
```bash
zip -r upwork-optimizer.zip . -x ".git/*" -x "backend/*" -x "config/config.template.js" -x ".DS_Store" -x "README.md"
```

### Packaging via Windows
1. Ensure you have correctly configured `BACKEND_URL` in `config.js`.
2. Select **only** the necessary extension folders and files: `background`, `config`, `content`, `css`, `firebase`, `icons`, `lib`, `popup`, `sidebar`, and `manifest.json`.
3. **DO NOT select** the `backend/` folder, `.git/`, or `README.md`.
4. Right-click the selected files -> **Send to** -> **Compressed (zipped) folder**.

Upload the resulting `.zip` file to the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole/).

## Tech Stack

- **Client:** Manifest V3, Web Crypto API, Firebase Auth (Native UI)
- **Server:** PHP 8+ strict-mode proxy, cURL, Firestore REST API
- **AI Models:** Gemini 2.0 Flash, OpenAI GPT-4o-mini
