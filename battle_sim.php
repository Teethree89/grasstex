<?php
/* Live Battle Sim proxy plus best-effort asset mirroring.

   The page itself is still fetched fresh from GitHub main on every request. Asset sync is
   deliberately throttled: at most once per 60 seconds this script asks GitHub for the
   recursive main tree, filters entries under Assets/, compares their Git blob SHAs with a
   tiny local state file, and downloads only changed/new files into this host's Assets/
   directory. If 50webs cannot write there, or GitHub has no Assets/ directory yet, the page
   still serves normally and X-Grasstex-Asset-Sync explains why.

   Once Assets/ is committed to this repo, pushing a changed asset is therefore enough; the
   next battle_sim.php request after the throttle window mirrors it to 50webs automatically. */

$repo = 'Teethree89/grasstex';
$branch = 'main';
$root = dirname(__FILE__);
$stateFile = $root . '/.battle-assets-state.json';
$syncInterval = 60;
$syncStatus = 'skipped';

function gh_get($url, $binary = false) {
    if (!function_exists('curl_init')) return false;
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
    curl_setopt($ch, CURLOPT_TIMEOUT, $binary ? 30 : 15);
    curl_setopt($ch, CURLOPT_USERAGENT, 'grasstex-50webs');
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $code < 200 || $code >= 300) return false;
    return $body;
}

function asset_path_safe($path) {
    return strpos($path, 'Assets/') === 0 && strpos($path, '..') === false && strpos($path, "\0") === false;
}

$state = array('checked_at' => 0, 'files' => array());
if (is_file($stateFile) && is_readable($stateFile)) {
    $decoded = json_decode(@file_get_contents($stateFile), true);
    if (is_array($decoded)) $state = array_merge($state, $decoded);
}

if (time() - intval($state['checked_at']) >= $syncInterval) {
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

                    $dir = dirname($dest);
                    if (!is_dir($dir) && !@mkdir($dir, 0775, true)) { $failed++; continue; }
                    $tmp = $dest . '.tmp';
                    if (@file_put_contents($tmp, $bytes, LOCK_EX) === false || !@rename($tmp, $dest)) {
                        @unlink($tmp); $failed++; continue;
                    }
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

$github = 'https://raw.githubusercontent.com/' . $repo . '/' . $branch . '/battle_sim.html?pull=' . time();
$fallback = $root . '/battle_sim.html';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('X-Grasstex-Asset-Sync: ' . $syncStatus);

$body = gh_get($github);
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
echo '<!doctype html><html><body style="font-family:Arial;background:#111;color:#fff;padding:30px"><h1>Battle sim unavailable</h1><p>GitHub could not be reached and local battle_sim.html was not found.</p></body></html>';
?>
