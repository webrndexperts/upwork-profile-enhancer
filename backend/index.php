<?php
declare(strict_types=1);

// Load Configuration and Classes
$config = require_once __DIR__ . '/config.php';
require_once __DIR__ . '/FirebaseVerifier.php';
require_once __DIR__ . '/LLMHandler.php';

// --- CORS & Headers ---
header("Access-Control-Allow-Origin: {$config['cors']['allowed_origin']}");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
    exit();
}

// Ensure error reporting is disabled for client output, but logs exist internally
ini_set('display_errors', '0');
error_reporting(E_ALL);

function sendError(int $code, string $message, string $errorCode = 'UNKNOWN_ERROR') {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $errorCode, 'message' => $message]);
    exit();
}

try {
    // 1. Get Authentication Token
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (!preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        sendError(401, 'Missing or invalid Authorization header.', 'NOT_AUTHENTICATED');
    }
    $idToken = $matches[1];

    // 2. Parse Request Body
    $input = file_get_contents('php://input');
    $payload = json_decode($input, true);
    
    if (!$payload) {
        sendError(400, 'Invalid JSON payload.', 'BAD_REQUEST');
    }

    $action = $payload['action'] ?? 'analyze';
    $provider = $payload['provider'] ?? 'gemini';
    $model = $payload['model'] ?? 'gemini-2.0-flash';
    $profileData = $payload['profileData'] ?? [];
    $resumeText = $payload['resumeText'] ?? null;
    $linkedinText = $payload['linkedinText'] ?? null;
    $topSkills = $payload['topSkills'] ?? null;

    if ($action === 'analyze' && empty($profileData)) {
        sendError(400, 'Profile data is required for analysis.', 'BAD_REQUEST');
    }

    // 3. Verify Firebase User
    $verifier = new FirebaseVerifier($config['firebase']['project_id']);
    $uid = $verifier->verifyIdToken($idToken);

    if (!$uid) {
        sendError(401, 'Invalid or expired authentication token. Please sign in again.', 'NOT_AUTHENTICATED');
    }

    // 4. Check Usage Limits
    $currentCount = 0;
    if (!$config['dev_unlimited_scans']) {
        $currentCount = $verifier->getUsageCount($uid, $idToken);
        if ($action === 'analyze' && $currentCount >= $config['free_scan_limit']) {
            sendError(403, 'Scan Limit Reached.', 'LIMIT_REACHED');
        }
    }

    // If only requesting usage, return now before LLM costs
    if ($action === 'get_usage') {
        echo json_encode([
            'success' => true,
            'analysisCount' => $currentCount,
        ]);
        exit();
    }

    // 5. Run AI Analysis
    $llmHandler = new LLMHandler($config['api_keys']['openai'], $config['api_keys']['gemini']);
    $analysisResult = $llmHandler->analyze($provider, $model, $profileData, $resumeText, $linkedinText, $topSkills);

    // 6. Increment Usage Limit on Success
    $newCount = 0;
    if (!$config['dev_unlimited_scans']) {
        $newCount = $verifier->incrementUsageCount($uid, $idToken, $currentCount ?? 0);
    }

    // 7. Return Result
    echo json_encode([
        'success' => true,
        'data' => $analysisResult,
        'analysisCount' => $newCount,
    ]);

} catch (\InvalidArgumentException $e) {
    sendError(400, $e->getMessage(), 'BAD_REQUEST');
} catch (\Exception $e) {
    error_log("Unhandled Server Error: " . $e->getMessage());
    sendError(500, 'An unexpected server error occurred during analysis.', 'SERVER_ERROR');
}
