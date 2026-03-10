// api-handler.js - Multi-provider AI support (Gemini + OpenAI) with data-driven prompts
// ─────────────────────────────────────────────────────────────────────────────────────

// ── Abuse Prevention ──────────────────────────────────────────────────────────
const MAX_INPUT_LENGTH   = 20000;
const MAX_REQUESTS_PER_HOUR = 10;
const requestLog = [];

/**
 * Checks if the current request exceeds the rate limit.
 *
 * @returns {boolean} True if rate limited
 */
function isRateLimited() {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  while (requestLog.length > 0 && requestLog[0] < oneHourAgo) {
    requestLog.shift();
  }
  return requestLog.length >= MAX_REQUESTS_PER_HOUR;
}

/**
 * Records a new request for rate limiting.
 */
function recordRequest() {
  requestLog.push(Date.now());
}

/**
 * Sanitizes user-provided text to prevent prompt injection.
 *
 * @param {string} text - Raw text from uploaded PDF or DOM
 * @returns {string} Sanitized text
 */
function sanitizeInput(text) {
  if (!text) return '';
  let clean = String(text).substring(0, MAX_INPUT_LENGTH);
  clean = clean.replace(/(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|rules?)/gi, '[FILTERED]');
  clean = clean.replace(/you\s+are\s+now\s+/gi, '[FILTERED]');
  clean = clean.replace(/system\s*:\s*/gi, '[FILTERED]');
  clean = clean.replace(/\[INST\]/gi, '[FILTERED]');
  clean = clean.replace(/<\/?(?:system|instruction|prompt)>/gi, '[FILTERED]');
  return clean.trim();
}

// ── Analysis Prompt (Data-Driven — No Examples) ───────────────────────────────

/**
 * Builds the analysis prompt for scoring the Upwork profile.
 * CRITICAL: No example JSON with hardcoded values — forces AI to analyze real data.
 *
 * @param {object} profileData - Extracted profile data from the DOM
 * @param {string|null} resumeText - Optional resume text
 * @param {string|null} linkedinText - Optional LinkedIn profile text
 * @returns {string} The formatted prompt
 */
function buildAnalysisPrompt(profileData, resumeText, linkedinText, topSkills) {
  const hasResume = !!resumeText;
  const hasLinkedin = !!linkedinText;
  const hasExtraDocs = hasResume || hasLinkedin;
  const hasSkills = !!topSkills;

  let prompt = `You are an expert Upwork profile optimizer. Analyze the ACTUAL profile data below and provide scoring and recommendations.

IMPORTANT RULES:
- Score ONLY based on the actual data provided. Do NOT assume, infer, or fabricate information.
- If a field is empty, null, or missing, that section scores low. Do not give credit for absent data.
- Every strength and improvement MUST reference specific data from the profile.
- Do NOT use generic placeholder text. All feedback must be specific to THIS profile.
- Do NOT use emojis anywhere in your response.
- Be deterministic: the same input must produce the same scores.

=== PROFILE DATA (from Upwork page DOM) ===
${JSON.stringify(profileData, null, 2)}
`;

  if (hasResume) {
    prompt += `
=== RESUME DATA (uploaded by user) ===
${sanitizeInput(resumeText)}
`;
  }

  if (hasLinkedin) {
    prompt += `
=== LINKEDIN PROFILE DATA (uploaded by user) ===
${sanitizeInput(linkedinText)}
`;
  }

  if (hasSkills) {
    prompt += `
=== USER-DECLARED TOP SKILLS ===
${sanitizeInput(topSkills)}

IMPORTANT: The user has declared these as their strongest skills. On Upwork, skill strength 
is often judged by completed projects, but that doesn't capture the full picture. 
Treat these skills as genuine strengths when evaluating the profile and generating 
recommendations. Factor them into the Skills section scoring and suggest how to 
better showcase them in the profile.
`;
  }

  prompt += `
=== SCORING FRAMEWORK ===

Score each section on a 0-10 scale. Assign earned points based on the weight:

| Section | Weight | What to Evaluate |
|---------|--------|-------------------|
| photo | 0.5 | Has photo? Quality indicators? Professional appearance? |
| title | 1.0 | Is it present? Keywords? Niche specificity? Value proposition? |
| overview | 2.0 | Present? Word count (250+ ideal)? Client-focused? Keywords? CTA? |
| portfolio | 1.5 | Item count? Descriptions? Variety? Relevance? |
| skills | 1.0 | Count? Relevance? Specificity? Trending skills present? |
| workHistory | 1.5 | Job success %? Review count? Client diversity? Earnings? |
| rates | 0.5 | Rate set? Competitive? Availability status? |
| compliance | 1.0 | Profile completeness? Badges? Certifications? ToS adherence? |

Total possible: 9.0 points, converted to a /10 score.
Categories: Critical (0-3), Good (4-6), Excellent (7-8), Elite (9-10).

=== TITLE & DESCRIPTION SUGGESTIONS ===

Based on the ACTUAL skills, projects, and specializations found in the profile data, generate:

1. "upworkOnlyTitles": 3 professional title suggestions optimized for Upwork search and client recommendations. Each must be based on the real skills/experience found in the DOM data.

${hasExtraDocs ? `2. "combinedTitles": 3 additional title suggestions that incorporate experience, certifications, and achievements from the uploaded resume/LinkedIn data that are NOT visible on the Upwork profile.` : ''}

3. "description": A comprehensive, professional Upwork profile description (400-600 words) structured with these sections using markdown-style formatting:

**Opening Hook** - Who you are and your core value proposition (2-3 sentences)

**Core Expertise** - Key skills, technologies, and areas of specialization with specific details

**Track Record** - Concrete achievements, metrics, results, and client outcomes. Reference actual projects/reviews from the profile data${hasExtraDocs ? ' and uploaded documents' : ''}.

**Work Approach** - Your process, communication style, delivery methodology, and what clients can expect

**Call to Action** - A clear, compelling next step for potential clients

The description must be specific to this person's actual background — not generic filler text.

=== RESPONSE FORMAT ===

Respond with ONLY a valid JSON object (no markdown code fences, no preamble, raw JSON):

{
  "overallScore": <number 0-10>,
  "totalPoints": <number 0-9>,
  "maxPoints": 9.0,
  "category": "<Critical|Good|Excellent|Elite>",
  "categoryDescription": "<one-line summary of profile standing>",
  "sections": [
    {
      "id": "<section_id from table above>",
      "name": "<human readable name>",
      "maxPoints": <weight from table>,
      "earnedPoints": <calculated points>,
      "score": <0-10 score>,
      "strengths": ["<specific strength referencing actual data>", ...],
      "improvements": ["<specific actionable improvement>", ...],
      "quickWin": "<single most impactful quick action>"
    }
  ],
  "top3Priorities": [
    {
      "rank": <1|2|3>,
      "section": "<section name>",
      "action": "<specific action to take>",
      "potentialGain": "<estimated point gain>"
    }
  ],
  "suggestions": {
    "upworkOnlyTitles": [
      { "title": "<suggested title>", "rationale": "<why this title works for this person>" }
    ],
    ${hasExtraDocs ? '"combinedTitles": [\n      { "title": "<suggested title>", "rationale": "<why, referencing resume/LinkedIn data>" }\n    ],' : ''}
    "description": "<full 400-600 word description with the 5 sections above, using ** for section headings>"
  }
}`;

  return prompt;
}

// ── Gemini Provider ────────────────────────────────────────────────────────
class GeminiProvider {
  /**
   * @param {string} model - The Gemini model to use
   */
  constructor(model = 'gemini-2.0-flash') {
    this.model = model;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  }

  /**
   * Analyzes profile data using the Gemini API.
   *
   * @param {object} profileData - Profile data from the DOM
   * @param {string} apiKey - Gemini API key
   * @param {string|null} resumeText - Optional resume text
   * @param {string|null} linkedinText - Optional LinkedIn text
   * @param {number} retries - Current retry count
   * @param {string|null} topSkills - Optional user-declared top skills
   * @returns {Promise<object>} Parsed analysis results
   */
  async analyze(profileData, apiKey, resumeText = null, linkedinText = null, signal = null, retries = 0, topSkills = null) {
    if (isRateLimited()) {
      throw new Error('Rate limit reached. Please wait before making more requests (max 10 per hour).');
    }
    recordRequest();

    const url = `${this.baseUrl}/${this.model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildAnalysisPrompt(profileData, resumeText, linkedinText, topSkills) }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8192 }
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 429 && retries < 3) {
        await sleep(1500 * (retries + 1));
        requestLog.pop();
        return this.analyze(profileData, apiKey, resumeText, linkedinText, retries + 1);
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
  /**
   * @param {string} model - The OpenAI model to use
   */
  constructor(model = 'gpt-4o-mini') {
    this.model = model;
    this.url = 'https://api.openai.com/v1/chat/completions';
  }

  /**
   * Analyzes profile data using the OpenAI API.
   *
   * @param {object} profileData - Profile data from the DOM
   * @param {string} apiKey - OpenAI API key
   * @param {string|null} resumeText - Optional resume text
   * @param {string|null} linkedinText - Optional LinkedIn text
   * @param {number} retries - Current retry count
   * @returns {Promise<object>} Parsed analysis results
   */
  async analyze(profileData, apiKey, resumeText = null, linkedinText = null, signal = null, retries = 0, topSkills = null) {
    if (isRateLimited()) {
      throw new Error('Rate limit reached. Please wait before making more requests (max 10 per hour).');
    }
    recordRequest();

    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      signal,
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        max_tokens: 8192,
        seed: 42,
        messages: [
          {
            role: 'system',
            content: 'You are an expert Upwork profile optimizer. Respond with raw JSON only. No markdown, no code blocks, no preamble. Do not use emojis. Be deterministic — the same input must produce the same output. Score based ONLY on actual data present, never infer or assume missing information.'
          },
          {
            role: 'user',
            content: buildAnalysisPrompt(profileData, resumeText, linkedinText, topSkills)
          }
        ]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 429 && retries < 3) {
        await sleep(1500 * (retries + 1));
        requestLog.pop();
        return this.analyze(profileData, apiKey, resumeText, linkedinText, retries + 1);
      }
      const msg = err.error?.message || `OpenAI API error ${res.status}`;
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
/**
 * Creates an AI provider instance.
 *
 * @param {string} providerName - 'gemini' or 'openai'
 * @param {string|null} model - Model identifier
 * @returns {GeminiProvider|OpenAIProvider}
 */
export function createProvider(providerName, model) {
  switch (providerName) {
    case 'openai':  return new OpenAIProvider(model || 'gpt-4o-mini');
    case 'gemini':
    default:        return new GeminiProvider(model || 'gemini-2.0-flash');
  }
}

/**
 * Checks if the current session is rate limited.
 *
 * @returns {boolean}
 */
export function checkRateLimit() {
  return isRateLimited();
}

export { sanitizeInput };

// ── Helpers ────────────────────────────────────────────────────────────────
/**
 * Parses a JSON response string, handling common formatting issues.
 *
 * @param {string} text - Raw text response from the AI
 * @returns {object} Parsed JSON object
 */
function parseJSON(text) {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not parse AI response as JSON. Please try again.');
  }
}

/**
 * Async sleep helper.
 *
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
