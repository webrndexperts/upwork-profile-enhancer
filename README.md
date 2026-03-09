# RND Upwork Profile Optimizer

AI-powered Chrome extension that analyzes Upwork freelancer profiles across 8 key sections and provides actionable improvement recommendations.

## Features

- **8-Section Analysis** — Complete profile scoring system
- **AI-Powered Insights** — Actionable recommendations via Gemini 2.5 Flash
- **Smart Icon Display** — Appears only on Upwork profile pages when logged in
- **Top 3 Priorities** — Ranked action plan with potential score improvements
- **Score History** — Local storage of past analyses
- **100% Free** — No paid tiers, no data collection

## Setup

### 1. Get a Gemini API Key (Free)
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a free API key
3. Copy it

### 2. Install the Extension
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `upwork-extension` folder

### 3. Add Your API Key
1. Click the extension icon in your browser toolbar
2. Click the ⚙️ Settings icon
3. Paste your Gemini API key
4. Click **Save API Key**

### 4. Analyze a Profile
1. Visit any Upwork freelancer profile (e.g., `upwork.com/freelancers/~...`)
2. A floating **"Analyze Profile"** button will appear in the bottom-right corner
3. Click it to open the analysis sidebar
4. Click **Start Analysis**
5. Wait ~10 seconds for results

## Adding Your Logo

Replace the placeholder icon files in `assets/icons/` with your actual logo:
- `icon16.png` — 16×16px
- `icon32.png` — 32×32px  
- `icon48.png` — 48×48px
- `icon128.png` — 128×128px

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
| **Total** | **9.0 pts → /10** |

## Score Categories

| Score | Category | Meaning |
|---|---|---|
| 1–3 | Critical | Immediate attention required |
| 4–6 | Good | Room for improvement |
| 7–8 | Excellent | Strong performance |
| 9–10 | Elite | Outstanding quality |

## Tech Stack

- Manifest V3
- Vanilla JS (content script, popup, sidebar)
- Gemini 2.5 Flash API
- Chrome Storage API
- TailwindCSS-inspired custom CSS

## Privacy

- All data processed locally
- API key stored in Chrome's local storage only
- No external data collection or tracking
- Profile data sent only to Google's Gemini API for analysis
