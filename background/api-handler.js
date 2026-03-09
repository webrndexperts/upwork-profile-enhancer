// api-handler.js - Multi-provider AI support (Gemini + OpenAI)

const ANALYSIS_PROMPT = (profileData) => `You are an expert Upwork profile optimizer. Analyze this freelancer's Upwork profile data and provide a detailed scoring and recommendations.

PROFILE DATA:
${JSON.stringify(profileData, null, 2)}

SCORING FRAMEWORK - Analyze each section and assign points:

1. Profile Photo (max 0.5 pts): Visual quality, professionalism, face visibility, background
2. Professional Title (max 1.0 pts): Clarity, keyword optimization, niche specificity, value proposition
3. Profile Overview (max 2.0 pts): Content quality, length (250+ words ideal), client-focused language, keywords, call-to-action
4. Portfolio & Project Catalog (max 1.5 pts): Number of items, quality, relevance, descriptions, variety
5. Skills & Specialization (max 1.0 pts): Relevance, completeness, specificity, trending skills
6. Work History & Social Proof (max 1.5 pts): Job success score, reviews quality, client diversity, earnings
7. Rates & Availability (max 0.5 pts): Market competitiveness, availability status, rate justification
8. Compliance & Optimization (max 1.0 pts): Profile completeness %, Upwork best practices, ToS adherence, badges

TOTAL POSSIBLE: 9.0 pts → converted to /10 score

Respond ONLY with a valid JSON object (no markdown, no code blocks, raw JSON only):
{
  "overallScore": 7.5,
  "totalPoints": 6.75,
  "maxPoints": 9.0,
  "category": "Excellent",
  "categoryDescription": "Strong performance with room for growth",
  "sections": [
    {
      "id": "photo",
      "name": "Profile Photo",
      "maxPoints": 0.5,
      "earnedPoints": 0.4,
      "score": 8,
      "strengths": ["Professional headshot", "Good lighting"],
      "improvements": ["Consider a more neutral background"],
      "quickWin": "Crop to show face at 60% of frame for better impact"
    },
    {
      "id": "title",
      "name": "Professional Title",
      "maxPoints": 1.0,
      "earnedPoints": 0.8,
      "score": 8,
      "strengths": ["Clear niche focus"],
      "improvements": ["Add a quantifiable result"],
      "quickWin": "Add a result metric to your title"
    },
    {
      "id": "overview",
      "name": "Profile Overview",
      "maxPoints": 2.0,
      "earnedPoints": 1.4,
      "score": 7,
      "strengths": ["Good length"],
      "improvements": ["Missing strong call-to-action"],
      "quickWin": "End with a clear CTA like 'Message me to discuss your project'"
    },
    {
      "id": "portfolio",
      "name": "Portfolio & Project Catalog",
      "maxPoints": 1.5,
      "earnedPoints": 1.0,
      "score": 6.5,
      "strengths": ["Diverse project types"],
      "improvements": ["Add more project descriptions"],
      "quickWin": "Add measurable outcomes to each portfolio item"
    },
    {
      "id": "skills",
      "name": "Skills & Specialization",
      "maxPoints": 1.0,
      "earnedPoints": 0.8,
      "score": 8,
      "strengths": ["Relevant core skills listed"],
      "improvements": ["Add trending tools in your niche"],
      "quickWin": "Research top 3 trending skills in your category and add them"
    },
    {
      "id": "workHistory",
      "name": "Work History & Social Proof",
      "maxPoints": 1.5,
      "earnedPoints": 1.2,
      "score": 8,
      "strengths": ["High job success score"],
      "improvements": ["Diversify client industries"],
      "quickWin": "Request feedback from recent clients who haven't left reviews"
    },
    {
      "id": "rates",
      "name": "Rates & Availability",
      "maxPoints": 0.5,
      "earnedPoints": 0.35,
      "score": 7,
      "strengths": ["Competitive rate"],
      "improvements": ["Set availability status"],
      "quickWin": "Set availability to 'More than 30 hrs/week' if possible"
    },
    {
      "id": "compliance",
      "name": "Compliance & Optimization",
      "maxPoints": 1.0,
      "earnedPoints": 0.8,
      "score": 8,
      "strengths": ["Profile 90%+ complete"],
      "improvements": ["Add English language certification"],
      "quickWin": "Complete the English language test to add credibility badge"
    }
  ],
  "top3Priorities": [
    {
      "rank": 1,
      "section": "Profile Overview",
      "action": "Add a strong call-to-action and 3 specific client results with metrics",
      "potentialGain": "+0.6 pts"
    },
    {
      "rank": 2,
      "section": "Portfolio & Project Catalog",
      "action": "Add measurable outcomes and client ROI to each portfolio description",
      "potentialGain": "+0.5 pts"
    },
    {
      "rank": 3,
      "section": "Rates & Availability",
      "action": "Update availability status and add a project catalog item",
      "potentialGain": "+0.15 pts"
    }
  ]
}

Score categories: Critical (1-3), Good (4-6), Excellent (7-8), Elite (9-10)
Base your analysis on the actual profile data provided. Be specific and actionable.`;

// ── Gemini Provider ────────────────────────────────────────────────────────
class GeminiProvider {
  constructor(model = 'gemini-2.0-flash') {
    this.model = model;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  }

  async analyze(profileData, apiKey, retries = 0) {
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: ANALYSIS_PROMPT(profileData) }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 429 && retries < 3) {
        await sleep(1500 * (retries + 1));
        return this.analyze(profileData, apiKey, retries + 1);
      }
      throw new Error(err.error?.message || `Gemini API error ${res.status}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini');
    return parseJSON(text);
  }
}

// ── OpenAI Provider ────────────────────────────────────────────────────────
class OpenAIProvider {
  constructor(model = 'gpt-4o-mini') {
    this.model = model;
    this.url = 'https://api.openai.com/v1/chat/completions';
  }

  async analyze(profileData, apiKey, retries = 0) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.3,
        max_tokens: 2048,
        messages: [
          {
            role: 'system',
            content: 'You are an expert Upwork profile optimizer. Always respond with raw JSON only — no markdown, no code blocks, no preamble.'
          },
          {
            role: 'user',
            content: ANALYSIS_PROMPT(profileData)
          }
        ]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 429 && retries < 3) {
        await sleep(1500 * (retries + 1));
        return this.analyze(profileData, apiKey, retries + 1);
      }
      const msg = err.error?.message || `OpenAI API error ${res.status}`;
      // Friendly error for common issues
      if (res.status === 401) throw new Error('Invalid OpenAI API key. Please check your key in Settings.');
      if (res.status === 402 || res.status === 429) throw new Error('OpenAI quota exceeded. Check your billing at platform.openai.com.');
      throw new Error(msg);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Empty response from OpenAI');
    return parseJSON(text);
  }
}

// ── Factory ────────────────────────────────────────────────────────────────
export function createProvider(providerName, model) {
  switch (providerName) {
    case 'openai':  return new OpenAIProvider(model || 'gpt-4o-mini');
    case 'gemini':
    default:        return new GeminiProvider(model || 'gemini-2.0-flash');
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function parseJSON(text) {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object from response
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not parse AI response as JSON. Please try again.');
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
