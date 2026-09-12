<?php
/* Live Battle Sim proxy plus asset mirroring.

   GitHub remains the source of the live loader and any files committed under Assets/.
   50webs mirrors changed GitHub assets locally. The live loader is fetched from GitHub's
   Contents API first so branch updates do not depend on raw.githubusercontent.com's CDN
   propagation; raw GitHub remains a fallback. */

$repo = 'Teethree89/grasstex';
$branch = 'main';
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

/* Keep the historical compact texture bootstrap for old deployments that still need it. */
$dirtDest = $root . '/Assets/dirttex.jpg';
$skyDest = $root . '/Assets/skytex.jpg';
if (!is_file($dirtDest) || @filesize($dirtDest) < 1024 || !is_file($skyDest) || @filesize($skyDest) < 1024) {
    $legacyCommit = '77968e5a83012003ca122831095e0cf945ac2116';
    $legacyUrl = 'https://raw.githubusercontent.com/' . $repo . '/' . $legacyCommit . '/battle/battle-sim.js?ts=' . time();
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

$state = array('checked_at' => 0, 'files' => array());
if (is_file($stateFile) && is_readable($stateFile)) {
    $decoded = json_decode(@file_get_contents($stateFile), true);
    if (is_array($decoded)) $state = array_merge($state, $decoded);
}

$requiredAudio = array('rifle.mp3','carbine.mp3','lmg.mp3','pistol.mp3');
$missingRequiredAsset = false;
foreach ($requiredAudio as $audioFile) {
    if (!is_file($root . '/Assets/audio/' . $audioFile)) { $missingRequiredAsset = true; break; }
}

if ($missingRequiredAsset || time() - intval($state['checked_at']) >= $syncInterval) {
    $treeUrl = 'https://api.github.com/repos/' . $repo . '/git/trees/' . rawurlencode($branch) . '?recursive=1&ts=' . time();
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
                    $rawUrl = 'https://raw.githubusercontent.com/' . $repo . '/' . rawurlencode($branch) . '/' . implode('/', $encoded) . '?ts=' . time();
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
    @file_put_contents($stateFile, json_encode($state), LOCK_EX);
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('X-Grasstex-Asset-Sync: ' . $syncStatus);
header('X-Grasstex-Texture-Bootstrap: ' . $textureBootstrapStatus);

/* Resolve current main through GitHub's Contents API first. This avoids the occasional lag
   observed when raw.githubusercontent.com/main still serves the preceding object briefly. */
$apiUrl = 'https://api.github.com/repos/' . $repo . '/contents/battle_sim.html?ref=' . rawurlencode($branch) . '&ts=' . time();
$apiBody = gh_get($apiUrl);
if ($apiBody !== false) {
    $api = json_decode($apiBody, true);
    if (is_array($api) && isset($api['content'], $api['encoding']) && $api['encoding'] === 'base64') {
        $body = base64_decode(str_replace(array("\r", "\n"), '', $api['content']), true);
        if ($body !== false && strlen($body) > 100 && stripos($body, '<html') !== false) {
            header('X-Grasstex-Source: github-contents-api');
            if (isset($api['sha'])) header('X-Grasstex-Loader-SHA: ' . $api['sha']);
            echo $body;
            exit;
        }
    }
}

$rawUrl = 'https://raw.githubusercontent.com/' . $repo . '/' . $branch . '/battle_sim.html?pull=' . time();
$body = gh_get($rawUrl);
if ($body !== false && strlen($body) > 100 && stripos($body, '<html') !== false) {
    header('X-Grasstex-Source: github-raw-fallback');
    echo $body;
    exit;
}

$fallback = $root . '/battle_sim.html';
if (is_file($fallback) && is_readable($fallback)) {
    header('X-Grasstex-Source: local-fallback');
    readfile($fallback);
    exit;
}

header('HTTP/1.1 503 Service Unavailable');
echo '<!doctype html><html><body style="font-family:Arial;background:#111;color:#fff;padding:30px"><h1>Battle sim unavailable</h1><p>GitHub could not be reached and local battle_sim.html was not found.</p></body></html>';
?>
