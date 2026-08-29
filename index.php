<?php
/*
  Legacy-compatible self-updater for 50webs.
  Keep index.html in this same folder as a fallback.
*/

$sourceUrl = 'https://raw.githubusercontent.com/Teethree89/grasstex/main/index.html';
$cacheFile = dirname(__FILE__) . '/.index-cache.html';
$fallbackFile = dirname(__FILE__) . '/index.html';
$cacheTtl = 30;
$maxBytes = 5242880;
$force = isset($_GET['refresh']) && $_GET['refresh'] == '1';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

function grass_valid_html($body, $maxBytes) {
    if (!is_string($body)) return false;
    $len = strlen($body);
    if ($len < 20 || $len > $maxBytes) return false;
    $start = strtolower(ltrim(substr($body, 0, 4096)));
    return strpos($start, '<!doctype html') !== false || strpos($start, '<html') !== false;
}

function grass_fetch($url) {
    $url .= '?pull=' . time();

    if (function_exists('curl_init')) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 6);
        curl_setopt($ch, CURLOPT_TIMEOUT, 12);
        curl_setopt($ch, CURLOPT_USERAGENT, 'grasstex-updater');
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($body !== false && $code >= 200 && $code < 300) return $body;
    }

    if (ini_get('allow_url_fopen')) {
        $opts = array(
            'http' => array(
                'method' => 'GET',
                'timeout' => 12,
                'header' => "User-Agent: grasstex-updater\r\nCache-Control: no-cache\r\n"
            )
        );
        $context = stream_context_create($opts);
        $body = @file_get_contents($url, false, $context);
        if ($body !== false) return $body;
    }

    return false;
}

$cacheOk = is_file($cacheFile);
$cacheAge = $cacheOk ? time() - @filemtime($cacheFile) : 999999;
$needFresh = $force || !$cacheOk || $cacheAge >= $cacheTtl;

if ($needFresh) {
    $fresh = grass_fetch($sourceUrl);
    if (grass_valid_html($fresh, $maxBytes)) {
        /* Cache when possible, but serving does not depend on write permission. */
        @file_put_contents($cacheFile, $fresh, LOCK_EX);
        header('X-Grasstex-Source: github');
        echo $fresh;
        exit;
    }
}

if ($cacheOk && is_readable($cacheFile)) {
    header('X-Grasstex-Source: cache');
    readfile($cacheFile);
    exit;
}

if (is_file($fallbackFile) && is_readable($fallbackFile)) {
    header('X-Grasstex-Source: fallback-index-html');
    readfile($fallbackFile);
    exit;
}

header('HTTP/1.1 503 Service Unavailable');
echo '<!doctype html><html><body><h1>Grass demo unavailable</h1><p>Could not reach GitHub and no local index.html fallback was found.</p></body></html>';
?>