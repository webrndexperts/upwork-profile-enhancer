<?php
declare(strict_types=1);

class LLMHandler
{
    private string $openAiKey;
    private string $geminiKey;

    public function __construct(string $openAiKey, string $geminiKey)
    {
        $this->openAiKey = $openAiKey;
        $this->geminiKey = $geminiKey;
    }

    public function analyze(string $provider, string $model, array $profileData, ?string $resumeText, ?string $linkedinText, ?string $topSkills): array
    {
        $prompt = $this->buildAnalysisPrompt($profileData, $resumeText, $linkedinText, $topSkills);

        if ($provider === 'openai') {
            return $this->callOpenAI($model, $prompt);
        } elseif ($provider === 'gemini') {
            return $this->callGemini($model, $prompt);
        }

        throw new \InvalidArgumentException("Invalid provider selected: {$provider}");
    }

    private function callOpenAI(string $model, string $prompt): array
    {
        $url = 'https://api.openai.com/v1/chat/completions';
        $postData = json_encode([
            'model' => $model,
            'messages' => [
                ['role' => 'user', 'content' => $prompt]
            ],
            'temperature' => 0.2, // Low temperature for deterministic scoring
            'max_completion_tokens' => 2500,
            'response_format' => ['type' => 'json_object']
        ]);

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Authorization: Bearer {$this->openAiKey}",
            "Content-Type: application/json"
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            error_log("OpenAI API Error: " . $response);
            throw new \RuntimeException("OpenAI API request failed.");
        }

        $data = json_decode($response, true);
        $content = $data['choices'][0]['message']['content'] ?? '';
        
        $parsed = json_decode($content, true);
        if (!$parsed) {
             throw new \RuntimeException("Failed to parse JSON response from OpenAI.");
        }
        
        return $parsed;
    }

    private function callGemini(string $model, string $prompt): array
    {
        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$this->geminiKey}";
        $postData = json_encode([
            'contents' => [
                [
                    'role' => 'user',
                    'parts' => [['text' => $prompt]]
                ]
            ],
            'generationConfig' => [
                'temperature' => 0.2,
                'maxOutputTokens' => 2500,
                'responseMimeType' => 'application/json'
            ]
        ]);

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Content-Type: application/json"
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            error_log("Gemini API Error: " . $response);
            throw new \RuntimeException("Gemini API request failed.");
        }

        $data = json_decode($response, true);
        $content = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
        
        $parsed = json_decode($content, true);
        if (!$parsed) {
             throw new \RuntimeException("Failed to parse JSON response from Gemini.");
        }
        
        return $parsed;
    }

    private function sanitizeInput(?string $text): string
    {
        if (!$text) return '';
        $clean = mb_substr((string)$text, 0, 20000);
        $clean = preg_replace('/(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|rules?)/i', '[FILTERED]', $clean);
        $clean = preg_replace('/you\s+are\s+now\s+/i', '[FILTERED]', $clean);
        $clean = preg_replace('/system\s*:\s*/i', '[FILTERED]', $clean);
        $clean = preg_replace('/\[INST\]/i', '[FILTERED]', $clean);
        $clean = preg_replace('/<\/?(?:system|instruction|prompt)>/i', '[FILTERED]', $clean);
        return trim($clean);
    }

    private function buildAnalysisPrompt(array $profileData, ?string $resumeText, ?string $linkedinText, ?string $topSkills): string
    {
        $hasResume = !empty($resumeText);
        $hasLinkedin = !empty($linkedinText);
        $hasExtraDocs = $hasResume || $hasLinkedin;
        $hasSkills = !empty($topSkills);

        $prompt = "You are an expert Upwork profile optimizer. Analyze the ACTUAL profile data below and provide scoring and recommendations.\n\n";
        $prompt .= "IMPORTANT RULES:\n";
        $prompt .= "- Score ONLY based on the actual data provided. Do NOT assume, infer, or fabricate information.\n";
        $prompt .= "- If a field is empty, null, or missing, that section scores low. Do not give credit for absent data.\n";
        $prompt .= "- Every strength and improvement MUST reference specific data from the profile.\n";
        $prompt .= "- Do NOT use generic placeholder text. All feedback must be specific to THIS profile.\n";
        $prompt .= "- Do NOT use emojis anywhere in your response.\n";
        $prompt .= "- Be deterministic: the same input must produce the same scores.\n\n";
        
        $prompt .= "=== PROFILE DATA (from Upwork page DOM) ===\n";
        $prompt .= json_encode($profileData, JSON_PRETTY_PRINT) . "\n\n";

        if ($hasResume) {
            $prompt .= "=== RESUME DATA (uploaded by user) ===\n";
            $prompt .= $this->sanitizeInput($resumeText) . "\n\n";
        }

        if ($hasLinkedin) {
            $prompt .= "=== LINKEDIN PROFILE DATA (uploaded by user) ===\n";
            $prompt .= $this->sanitizeInput($linkedinText) . "\n\n";
        }

        if ($hasSkills) {
            $prompt .= "=== USER-DECLARED TOP SKILLS ===\n";
            $prompt .= $this->sanitizeInput($topSkills) . "\n\n";
            $prompt .= "IMPORTANT: The user has declared these as their strongest skills. On Upwork, skill strength \n";
            $prompt .= "is often judged by completed projects, but that doesn't capture the full picture. \n";
            $prompt .= "Treat these skills as genuine strengths when evaluating the profile and generating \n";
            $prompt .= "recommendations. Factor them into the Skills section scoring and suggest how to \n";
            $prompt .= "better showcase them in the profile.\n\n";
        }

        $prompt .= "=== SCORING FRAMEWORK ===\n\n";
        $prompt .= "Score each section on a 0-10 scale. Assign earned points based on the weight:\n\n";
        $prompt .= "| Section | Weight | What to Evaluate |\n";
        $prompt .= "|---------|--------|-------------------|\n";
        $prompt .= "| photo | 0.5 | Has photo? Quality indicators? Professional appearance? |\n";
        $prompt .= "| title | 1.0 | Is it present? Keywords? Niche specificity? Value proposition? |\n";
        $prompt .= "| overview | 2.0 | Present? Word count (250+ ideal)? Client-focused? Keywords? CTA? |\n";
        $prompt .= "| portfolio | 1.5 | Item count? Descriptions? Variety? Relevance? |\n";
        $prompt .= "| skills | 1.0 | Count? Relevance? Specificity? Trending skills present? |\n";
        $prompt .= "| workHistory | 1.5 | Job success %? Review count? Client diversity? Earnings? |\n";
        $prompt .= "| rates | 0.5 | Rate set? Competitive? Availability status? |\n";
        $prompt .= "| compliance | 1.0 | Profile completeness? Badges? Certifications? ToS adherence? |\n\n";
        $prompt .= "Total possible: 9.0 points, converted to a /10 score.\n";
        $prompt .= "Categories: Critical (0-3), Good (4-6), Excellent (7-8), Elite (9-10).\n\n";

        $prompt .= "=== TITLE & DESCRIPTION SUGGESTIONS ===\n\n";
        $prompt .= "Based on the ACTUAL skills, projects, and specializations found in the profile data, generate:\n\n";
        $prompt .= "1. \"upworkOnlyTitles\": 3 professional title suggestions optimized for Upwork search and client recommendations. Each must be based on the real skills/experience found in the DOM data.\n\n";

        if ($hasExtraDocs) {
            $prompt .= "2. \"combinedTitles\": 3 additional title suggestions that incorporate experience, certifications, and achievements from the uploaded resume/LinkedIn data that are NOT visible on the Upwork profile.\n\n";
        }

        $prompt .= "3. \"description\": A comprehensive, professional Upwork profile description (400-600 words) structured with these sections using markdown-style formatting:\n\n";
        $prompt .= "**Opening Hook** - Who you are and your core value proposition (2-3 sentences)\n\n";
        $prompt .= "**Core Expertise** - Key skills, technologies, and areas of specialization with specific details\n\n";
        
        $prompt .= "**Track Record** - Concrete achievements, metrics, results, and client outcomes. Reference actual projects/reviews from the profile data";
        if ($hasExtraDocs) {
             $prompt .= " and uploaded documents.\n\n";
        } else {
             $prompt .= ".\n\n";
        }

        $prompt .= "**Work Approach** - Your process, communication style, delivery methodology, and what clients can expect\n\n";
        $prompt .= "**Call to Action** - A clear, compelling next step for potential clients\n\n";
        $prompt .= "The description must be specific to this person's actual background — not generic filler text.\n\n";

        $prompt .= "=== RESPONSE FORMAT ===\n\n";
        $prompt .= "Respond with ONLY a valid JSON object (no markdown code fences, no preamble, raw JSON):\n\n";
        $prompt .= "{\n";
        $prompt .= "  \"overallScore\": <number 0-10>,\n";
        $prompt .= "  \"totalPoints\": <number 0-9>,\n";
        $prompt .= "  \"maxPoints\": 9.0,\n";
        $prompt .= "  \"category\": \"<Critical|Good|Excellent|Elite>\",\n";
        $prompt .= "  \"categoryDescription\": \"<one-line summary of profile standing>\",\n";
        $prompt .= "  \"sections\": [\n";
        $prompt .= "    {\n";
        $prompt .= "      \"id\": \"<section_id from table above>\",\n";
        $prompt .= "      \"name\": \"<human readable name>\",\n";
        $prompt .= "      \"maxPoints\": <weight from table>,\n";
        $prompt .= "      \"earnedPoints\": <calculated points>,\n";
        $prompt .= "      \"score\": <0-10 score>,\n";
        $prompt .= "      \"strengths\": [\"<specific strength referencing actual data>\", ...],\n";
        $prompt .= "      \"improvements\": [\"<specific actionable improvement>\", ...],\n";
        $prompt .= "      \"quickWin\": \"<single most impactful quick action>\"\n";
        $prompt .= "    }\n";
        $prompt .= "  ],\n";
        $prompt .= "  \"top3Priorities\": [\n";
        $prompt .= "    {\n";
        $prompt .= "      \"rank\": <1|2|3>,\n";
        $prompt .= "      \"section\": \"<section name>\",\n";
        $prompt .= "      \"action\": \"<specific action to take>\",\n";
        $prompt .= "      \"potentialGain\": \"<estimated point gain>\"\n";
        $prompt .= "    }\n";
        $prompt .= "  ],\n";
        $prompt .= "  \"suggestions\": {\n";
        $prompt .= "    \"upworkOnlyTitles\": [\n";
        $prompt .= "      { \"title\": \"<suggested title>\", \"rationale\": \"<why this title works for this person>\" }\n";
        $prompt .= "    ],\n";
        
        if ($hasExtraDocs) {
            $prompt .= "    \"combinedTitles\": [\n";
            $prompt .= "      { \"title\": \"<suggested title>\", \"rationale\": \"<why, referencing resume/LinkedIn data>\" }\n";
            $prompt .= "    ],\n";
        }

        $prompt .= "    \"description\": \"<full 400-600 word description with the 5 sections above, using ** for section headings>\"\n";
        $prompt .= "  }\n";
        $prompt .= "}";

        return $prompt;
    }
}
