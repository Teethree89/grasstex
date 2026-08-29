<?php
$github = 'https://raw.githubusercontent.com/Teethree89/grasstex/main/index.html?pull=' . time();
$fallback = dirname(__FILE__) . '/index.html';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$body = false;

if (function_exists('curl_init')) {
    $ch = curl_init($github);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_USERAGENT, 'grasstex-50webs');
    /* 50webs uses an old PHP/CA stack; this is public read-only GitHub content. */
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $code < 200 || $code >= 300) {
        $body = false;
    }
}

if ($body !== false && strlen($body) > 100 && stripos($body, '<html') !== false) {
    header('X-Grasstex-Source: github-live');
    echo $body;
    exit;
}

if (is_file($fallback) && is_readable($fallback)) {
    header('X-Grasstex-Source: local-fallback');
    readfile($fallback);
    exit;
}

header('HTTP/1.1 503 Service Unavailable');
echo '<!doctype html><html><body style="font-family:Arial;background:#111;color:#fff;padding:30px"><h1>Grass demo unavailable</h1><p>GitHub could not be reached and local index.html was not found.</p></body></html>';
?>