<?php
declare(strict_types=1);

/*
  Self-updating front controller for the grass demo.

  Upload this file to /grasstex/index.php on 50webs and set .htaccess to:
      DirectoryIndex index.php index.html

  On each request it serves a local cached copy immediately. If the cache is
  older than CACHE_TTL_SECONDS, it tries to refresh from GitHub main/index.html.
  If GitHub is temporarily unreachable, the last known-good cached copy is
  still served. If no cache exists yet, it falls back to local index.html.
*/

const SOURCE_URL = 'https://raw.githubusercontent.com/Teethree89/grasstex/main/index.html';
const CACHE_FILENAME = '.index-cache.html';
const FALLBACK_FILENAME = 'index.html';
const CACHE_TTL_SECONDS = 30;
const MAX_BYTES = 5 * 1024 * 1024;

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('X-Content-Type-Options: nosniff');

$cachePath = __DIR__ . DIRECTORY_SEPARATOR . CACHE_FILENAME;
$fallbackPath = __DIR__ . DIRECTORY_SEPARATOR . FALLBACK_FILENAME;
$forceRefresh = isset($_GET['refresh']) && $_GET['refresh'] === '1';
$now = time();
$cacheExists = is_file($cachePath);
$cacheMtime = $cacheExists ? (int) @filemtime($cachePath) : 0;
$cacheAge = $cacheExists ? max(0, $now - $cacheMtime) : PHP_INT_MAX;
$needsRefresh = $forceRefresh || !$cacheExists || $cacheAge >= CACHE_TTL_SECONDS;

function looks_like_html(string $body): bool {
    $prefix = ltrim(substr($body, 0, 4096));
    return stripos($prefix, '<!doctype html') !== false || stripos($prefix, '<html') !== false;
}

function fetch_source(string $url): ?string {
    $busted = $url . '?pull=' . rawurlencode((string) time());

    if (function_exists('curl_init')) {
        $ch = curl_init($busted);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_USERAGENT => 'grasstex-self-updater/1.0',
            CURLOPT_HTTPHEADER => [
                'Accept: text/html,text/plain;q=0.9,*/*;q=0.1',
                'Cache-Control: no-cache',
                'Pragma: no-cache'
            ]
        ]);

        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if (is_string($body) && $status >= 200 && $status < 300) {
            return $body;
        }
    }

    if (ini_get('allow_url_fopen')) {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 10,
                'header' => "User-Agent: grasstex-self-updater/1.0\r\nCache-Control: no-cache\r\nPragma: no-cache\r\n"
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true
            ]
        ]);
        $body = @file_get_contents($busted, false, $context);
        if (is_string($body)) {
            return $body;
        }
    }

    return null;
}

function atomically_write(string $target, string $body): bool {
    try {
        $tmp = dirname($target) . DIRECTORY_SEPARATOR . '.pull-' . bin2hex(random_bytes(8)) . '.tmp';
    } catch (Throwable $e) {
        return false;
    }

    $bytes = @file_put_contents($tmp, $body, LOCK_EX);
    if ($bytes === false || $bytes !== strlen($body)) {
        @unlink($tmp);
        return false;
    }

    if (!@rename($tmp, $target)) {
        @unlink($tmp);
        return false;
    }

    @chmod($target, 0644);
    return true;
}

$sourceLabel = 'cache';

if ($needsRefresh) {
    $fresh = fetch_source(SOURCE_URL);

    if (
        is_string($fresh) &&
        strlen($fresh) >= 20 &&
        strlen($fresh) <= MAX_BYTES &&
        looks_like_html($fresh) &&
        atomically_write($cachePath, $fresh)
    ) {
        $cacheExists = true;
        $cacheMtime = (int) @filemtime($cachePath);
        $cacheAge = 0;
        $sourceLabel = 'github-refresh';
    } elseif ($cacheExists) {
        $sourceLabel = 'stale-cache';
    } else {
        $sourceLabel = 'fallback';
    }
}

if ($cacheExists) {
    header('X-Grasstex-Source: ' . $sourceLabel);
    header('X-Grasstex-Cache-Age: ' . (string) $cacheAge);
    readfile($cachePath);
    exit;
}

if (is_file($fallbackPath)) {
    header('X-Grasstex-Source: fallback-index-html');
    readfile($fallbackPath);
    exit;
}

http_response_code(503);
echo '<!doctype html><html><body><h1>Grass demo temporarily unavailable</h1><p>No cached or fallback index file is available yet.</p></body></html>';
