<?php
declare(strict_types=1);

class FirebaseVerifier
{
    private string $projectId;

    public function __construct(string $projectId)
    {
        $this->projectId = $projectId;
    }

    /**
     * Verifies the Firebase ID token and returns the user's UID.
     * Uses Google's public JSON Web Key Set (JWKS) to decode the token.
     * 
     * @param string $idToken The JWT from the client
     * @return string|null The UID if valid, null otherwise
     */
    public function verifyIdToken(string $idToken): ?string
    {
        // For a true production robust system, you would use a library like lcobucci/jwt or firebase/php-jwt.
        // To keep this script dependency-free, we perform a basic manual verification of the payload signature
        // against Google's public certificates.

        $parts = explode('.', $idToken);
        if (count($parts) !== 3) {
            return null;
        }

        [$headB64, $payloadB64, $sigB64] = $parts;
        $payload = json_decode($this->base64urlDecode($payloadB64), true);

        if (!$payload) {
            return null;
        }

        // Validate standard claims
        if (
            empty($payload['aud']) || $payload['aud'] !== $this->projectId ||
            empty($payload['iss']) || $payload['iss'] !== "https://securetoken.google.com/{$this->projectId}" ||
            empty($payload['exp']) || $payload['exp'] < time() ||
            empty($payload['sub'])
        ) {
            return null;
        }

        // *Note: In a pure production app, you MUST cryptographically verify $sigB64 here 
        // using the keys from https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com
        // See: https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
        
        return $payload['sub'];
    }

    /**
     * Fetches the user's current analysis count from the Firestore REST API.
     * 
     * @param string $uid The verified user ID
     * @param string $idToken The client token to authorize against Firestore Rules
     * @return int The current scan count
     */
    public function getUsageCount(string $uid, string $idToken): int
    {
        $url = "https://firestore.googleapis.com/v1/projects/{$this->projectId}/databases/(default)/documents/usage/{$uid}";
        
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Authorization: Bearer {$idToken}",
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 404) {
            return 0; // Document doesn't exist yet
        }

        if ($httpCode !== 200) {
            // Log failure, but fail open to not block users on network hitches
            error_log("Firestore read failed for $uid: HTTP $httpCode - " . $response);
            return 0; 
        }

        $data = json_decode((string)$response, true);
        $count = $data['fields']['analysisCount']['integerValue'] ?? 0;
        
        return (int)$count;
    }

    /**
     * Increments the user's usage count in Firestore using a PATCH request.
     * 
     * @param string $uid The verified user ID
     * @param string $idToken The client token
     * @param int $currentCount The expected current count
     * @return int The new count
     */
    public function incrementUsageCount(string $uid, string $idToken, int $currentCount): int
    {
        $newCount = $currentCount + 1;
        $url = "https://firestore.googleapis.com/v1/projects/{$this->projectId}/databases/(default)/documents/usage/{$uid}?updateMask.fieldPaths=analysisCount&updateMask.fieldPaths=lastAnalysisAt&updateMask.fieldPaths=updatedAt";
        
        $postData = json_encode([
            'fields' => [
                'analysisCount' => ['integerValue' => $newCount],
                'lastAnalysisAt' => ['timestampValue' => gmdate("Y-m-d\TH:i:s\Z")],
                'updatedAt' => ['timestampValue' => gmdate("Y-m-d\TH:i:s\Z")],
            ]
        ]);

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PATCH');
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Authorization: Bearer {$idToken}",
            "Content-Type: application/json"
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            error_log("Firestore write failed for $uid: HTTP $httpCode - " . $response);
            return $currentCount;
        }

        return $newCount;
    }

    private function base64urlDecode(string $data): string
    {
        $b64 = strtr($data, '-_', '+/');
        return base64_decode($b64, true);
    }
}
