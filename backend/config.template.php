<?php
declare(strict_types=1);

/**
 * Backend Configuration TEMPLATE
 * 
 * 1. Copy this file and rename it to `config.php`
 * 2. Fill in your actual production API keys below.
 * 3. IMPORTANT: Ensure `config.php` is in your .gitignore!
 */
return [
    'api_keys' => [
        // OpenAI API Key (starts with sk-...)
        'openai' => 'ENTER_YOUR_OPENAI_KEY_HERE',
        // Google Gemini API Key
        'gemini' => 'ENTER_YOUR_GEMINI_KEY_HERE',
    ],
    
    'firebase' => [
        // The project ID from your Firebase project
        'project_id' => 'upwork-profile-enhancer',
    ],
    
    'cors' => [
        // To strictly lock down the API, replace '*' with your Chrome Extension Origin
        // e.g., 'chrome-extension://ddcejogbipbgfgpdkohadjkihnpkljbn'
        'allowed_origin' => '*',
    ],
    
    // Developer mode flag. Set to false in production to enforce the 5-scan limit.
    'dev_unlimited_scans' => false,
    
    // Free trials
    'free_scan_limit' => 5,
];
