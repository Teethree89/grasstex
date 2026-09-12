<?php
/* Live Battle Sim proxy plus asset mirroring.

   GitHub remains the source of the live loader and any files committed under Assets/.
   Normal play always follows main. An immutable commit/tag is honored only when the URL
   explicitly opts into diagnostic pinning with ?pin=1&ref=<ref>. This prevents stale ref
   query strings from freezing normal play on an old build. */

$repo = 'Teethree89/grasstex';
$pinRequested = isset($_GET['pin']) && $_GET['pin'] === '1';
$requestedRef = ($pinRequested && isset($_GET['ref']) && $_GET['ref'] !== '') ? $_GET['ref'] : 'main';
$root = dirname(__FILE__);
$stateFile = $root . '/.battle-assets-state.json';
$syncInterval = 60;
$syncStatus = 'skipped';
$textureBootstrapStatus = 'already-present';

function gh_get($url, $binary = false) {
    if (!function_exists('curl_init')) return false;
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
    curl_setopt($ch, CURLOPT_TIMEOUT, $binary ? 30 : 20);
    curl_setopt($ch, CURLOPT_USERAGENT, 'grasstex-50webs');
    curl_setopt($ch, CURLOPT_HTTPHEADER, array('Cache-Control: no-cache', 'Pragma: no-cache'));
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $code < 200 || $code >= 300) return false;
    return $body;
}

function atomic_write($dest, $bytes) {
    $dir = dirname($dest);
    if (!is_dir($dir) && !@mkdir($dir, 0775, true)) return false;
    $tmp = $dest . '.tmp';
    if (@file_put_contents($tmp, $bytes, LOCK_EX) === false) { @unlink($tmp); return false; }
    if (!@rename($tmp, $dest)) { @unlink($tmp); return false; }
    return true;
}

function asset_path_safe($path) {
    return strpos($path, 'Assets/') === 0 && strpos($path, '..') === false && strpos($path, "\0") === false;
}

/* Resolve the selected ref once. In normal mode that ref is always main. */
$resolvedRef = $requestedRef;
$commitUrl = 'https://api.github.com/repos/' . $repo . '/commits/' . rawurlencode($requestedRef) . '?cb=' . microtime(true);
$commitBody = gh_get($commitUrl);
if ($commitBody !== false) {
    $commit = json_decode($commitBody, true);
    if (is_array($commit) && isset($commit['sha']) && preg_match('/^[0-9a-f]{40}$/i', $commit['sha'])) {
        $resolvedRef = $commit['sha'];
    }
}

/* Keep the historical compact texture bootstrap for old deployments that still need it. */
$dirtDest = $root . '/Assets/dirttex.jpg';
$skyDest = $root . '/Assets/skytex.jpg';
if (!is_file($dirtDest) || @filesize($dirtDest) < 1024 || !is_file($skyDest) || @filesize($skyDest) < 1024) {
    $legacyCommit = '77968e5a83012003ca122831095e0cf945ac2116';
    $legacyUrl = 'https://raw.githubusercontent.com/' . $repo . '/' . $legacyCommit . '/battle/battle-sim.js?cb=' . microtime(true);
    $legacy = gh_get($legacyUrl);
    if ($legacy === false) {
        $textureBootstrapStatus = 'source-fetch-failed';
    } else {
        $made = 0; $failed = 0;
        $jobs = array(
            array('name' => 'DIRT_TEXTURE_URL', 'dest' => $dirtDest),
            array('name' => 'SKY_TEXTURE_URL', 'dest' => $skyDest)
        );
        foreach ($jobs as $job) {
            if (is_file($job['dest']) && @filesize($job['dest']) >= 1024) continue;
            $pattern = "/var\\s+" . preg_quote($job['name'], '/') . "='data:image\\/jpeg;base64,([^']+)'/s";
            if (!preg_match($pattern, $legacy, $m)) { $failed++; continue; }
            $bytes = base64_decode($m[1], true);
            if ($bytes === false || strlen($bytes) < 1024 || !atomic_write($job['dest'], $bytes)) { $failed++; continue; }
            $made++;
        }
        $textureBootstrapStatus = $failed ? ('partial-' . $made . '-written-' . $failed . '-failed') : ($made . '-written');
    }
}

$state = array('checked_at' => 0, 'files' => array(), 'resolved_ref' => '');
if (is_file($stateFile) && is_readable($stateFile)) {
    $decoded = json_decode(@file_get_contents($stateFile), true);
    if (is_array($decoded)) $state = array_merge($state, $decoded);
}

$requiredAudio = array('rifle.mp3','carbine.mp3','lmg.mp3','pistol.mp3');
$missingRequiredAsset = false;
foreach ($requiredAudio as $audioFile) {
    if (!is_file($root . '/Assets/audio/' . $audioFile)) { $missingRequiredAsset = true; break; }
}

/* A new resolved commit bypasses the normal 60-second sync interval immediately. */
$refChanged = !isset($state['resolved_ref']) || $state['resolved_ref'] !== $resolvedRef;
if ($missingRequiredAsset || $refChanged || time() - intval($state['checked_at']) >= $syncInterval) {
    $treeUrl = 'https://api.github.com/repos/' . $repo . '/git/trees/' . rawurlencode($resolvedRef) . '?recursive=1&cb=' . microtime(true);
    $treeBody = gh_get($treeUrl);
    if ($treeBody === false) {
        $syncStatus = 'tree-fetch-failed';
    } else {
        $tree = json_decode($treeBody, true);
        if (!is_array($tree) || !isset($tree['tree']) || !is_array($tree['tree'])) {
            $syncStatus = 'tree-invalid';
        } else {
            $assets = array();
            foreach ($tree['tree'] as $entry) {
                if (!isset($entry['type'], $entry['path'], $entry['sha'])) continue;
                if ($entry['type'] !== 'blob' || !asset_path_safe($entry['path'])) continue;
                $assets[] = $entry;
            }
            if (count($assets) === 0) {
                $syncStatus = 'no-github-assets';
            } else {
                $changed = 0; $failed = 0;
                foreach ($assets as $entry) {
                    $path = $entry['path'];
                    $sha = $entry['sha'];
                    $dest = $root . '/' . $path;
                    $known = isset($state['files'][$path]) ? $state['files'][$path] : null;
                    if ($known === $sha && is_file($dest)) continue;
                    $segments = explode('/', $path);
                    $encoded = array();
                    foreach ($segments as $segment) $encoded[] = rawurlencode($segment);
                    $rawUrl = 'https://raw.githubusercontent.com/' . $repo . '/' . rawurlencode($resolvedRef) . '/' . implode('/', $encoded) . '?cb=' . microtime(true);
                    $bytes = gh_get($rawUrl, true);
                    if ($bytes === false) { $failed++; continue; }
                    if (!atomic_write($dest, $bytes)) { $failed++; continue; }
                    $state['files'][$path] = $sha;
                    $changed++;
                }
                $syncStatus = $failed ? ('partial-' . $changed . '-updated-' . $failed . '-failed') : ($changed . '-updated');
            }
        }
    }
    $state['checked_at'] = time();
    $state['resolved_ref'] = $resolvedRef;
    @file_put_contents($stateFile, json_encode($state), LOCK_EX);
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('Surrogate-Control: no-store');
header('X-Grasstex-Asset-Sync: ' . $syncStatus);
header('X-Grasstex-Texture-Bootstrap: ' . $textureBootstrapStatus);
header('X-Grasstex-Pinned: ' . ($pinRequested ? '1' : '0'));
header('X-Grasstex-Requested-Ref: ' . preg_replace('/[^0-9A-Za-z._\/-]/', '', $requestedRef));
header('X-Grasstex-Resolved-Ref: ' . preg_replace('/[^0-9A-Fa-f]/', '', $resolvedRef));

/* Force the client loader to use the exact server-resolved SHA. We intentionally replace the
   entire query-ref expression, not only its fallback, so stale ?ref= values cannot override
   normal live mode. Pinned diagnostics are already resolved server-side above. */
function pin_loader_ref($body, $resolvedRef) {
    return str_replace("new URLSearchParams(location.search).get('ref')||'main'", "'" . $resolvedRef . "'", $body);
}

/* Fetch the loader by immutable SHA through GitHub's Contents API. */
$apiUrl = 'https://api.github.com/repos/' . $repo . '/contents/battle_sim.html?ref=' . rawurlencode($resolvedRef) . '&cb=' . microtime(true);
$apiBody = gh_get($apiUrl);
if ($apiBody !== false) {
    $api = json_decode($apiBody, true);
    if (is_array($api) && isset($api['content'], $api['encoding']) && $api['encoding'] === 'base64') {
        $body = base64_decode(str_replace(array("\r", "\n"), '', $api['content']), true);
        if ($body !== false && strlen($body) > 100 && stripos($body, '<html') !== false) {
            $body = pin_loader_ref($body, $resolvedRef);
            header('X-Grasstex-Source: github-contents-api');
            if (isset($api['sha'])) header('X-Grasstex-Loader-SHA: ' . $api['sha']);
            echo $body;
            exit;
        }
    }
}

/* Raw fallback is still immutable because it also uses the resolved commit SHA. */
$rawUrl = 'https://raw.githubusercontent.com/' . $repo . '/' . rawurlencode($resolvedRef) . '/battle_sim.html?cb=' . microtime(true);
$body = gh_get($rawUrl);
if ($body !== false && strlen($body) > 100 && stripos($body, '<html') !== false) {
    $body = pin_loader_ref($body, $resolvedRef);
    header('X-Grasstex-Source: github-raw-fallback');
    echo $body;
    exit;
}

$fallback = $root . '/battle_sim.html';
if (is_file($fallback) && is_readable($fallback)) {
    $body = @file_get_contents($fallback);
    if ($body !== false) {
        $body = pin_loader_ref($body, $resolvedRef);
        header('X-Grasstex-Source: local-fallback');
        echo $body;
        exit;
    }
}

header('HTTP/1.1 503 Service Unavailable');
echo '<!doctype html><html><body style="font-family:Arial;background:#111;color:#fff;padding:30px"><h1>Battle sim unavailable</h1><p>GitHub could not be reached and local battle_sim.html was not found.</p></body></html>';
?>