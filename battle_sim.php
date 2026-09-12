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

/* Serve the modular page directly. The retired root loader patched source strings at runtime,
   so it broke whenever the battle code changed and never loaded the full trainer stack. */
$base = 'https://raw.githubusercontent.com/' . $repo . '/' . rawurlencode($resolvedRef) . '/';
$body = gh_get($base . 'battle/battle_sim.html?cb=' . microtime(true));
if ($body !== false && strlen($body) > 100 && stripos($body, '<html') !== false) {
    $manifest = null;
    $manifestBody = gh_get($base . 'Assets/audio/manifest.json?cb=' . microtime(true));
    if ($manifestBody !== false) { $decodedManifest = json_decode($manifestBody, true); if (is_array($decodedManifest)) $manifest = $decodedManifest; }
    $policyState = null; $policyPath = $root . '/state/ai-policy.json';
    if (is_file($policyPath) && is_readable($policyPath)) { $decodedPolicy = json_decode(@file_get_contents($policyPath), true); if (is_array($decodedPolicy)) $policyState = $decodedPolicy; }
    $memoryState = array('version'=>1,'experiences'=>array()); $memoryPath = $root . '/state/scenario-memory.json';
    if (is_file($memoryPath) && is_readable($memoryPath)) { $decodedMemory = json_decode(@file_get_contents($memoryPath), true); if (is_array($decodedMemory) && isset($decodedMemory['experiences']) && is_array($decodedMemory['experiences'])) { $decodedMemory['experiences'] = array_slice($decodedMemory['experiences'], -180); $memoryState = $decodedMemory; } }
    $requestedSeed = isset($_GET['seed']) ? substr(preg_replace('/[^a-zA-Z0-9_.-]/','-',strval($_GET['seed'])),0,100) : '';
    $bootstrap = '<script>window.BATTLE_BUILD="v22";window.BATTLE_REF='.json_encode($resolvedRef).';window.BATTLE_ASSET_BASE="https://test.ivandpopov.com/grasstex/Assets/";window.BATTLE_AUDIO_BASE="https://test.ivandpopov.com/grasstex/Assets/audio/";window.BATTLE_API_BASE="/grasstex/";window.BATTLE_AUDIO_MANIFEST='.json_encode($manifest).';window.BATTLE_AI_POLICY='.json_encode($policyState).';window.BATTLE_AI_MEMORY='.json_encode($memoryState).';window.BATTLE_SCENARIO_SEED='.json_encode($requestedSeed).';</script>';
    $cdnTag = '<script src="https://cdn.jsdelivr.net/npm/babylonjs@8.26.0/babylon.js"></script>';
    if (strpos($body, $cdnTag) !== false) $body = str_replace($cdnTag, $bootstrap."\n".$cdnTag, $body);
    $version = rawurlencode($resolvedRef);
    foreach (array('soldier.js','weapons.js','terrain-features.js','squad-ai.js','battle-sim.js') as $file) $body = str_replace('<script src="'.$file.'"></script>', '<script src="'.$base.'battle/'.$file.'?v='.$version.'"></script>', $body);
    $extras = '';
    foreach (array('acoustics.js','scenario-generator.js','battle-navigation.js','town-objectives.js','module-registry.js','ai-policy.js','objective-system.js','battle-telemetry.js','commander-ai.js') as $file) $extras .= '<script src="'.$base.'battle/'.$file.'?v='.$version.'"></script>' . "\n";
    foreach (array('01-capture-zone.js','10-infantry-squad.js','20-building-hardpoints.js') as $file) $extras .= '<script src="'.$base.'battle/modules/'.$file.'?v='.$version.'"></script>' . "\n";
    foreach (array('ai-trainer.js','battle-control.js') as $file) $extras .= '<script src="'.$base.'battle/'.$file.'?v='.$version.'"></script>' . "\n";
    $body = preg_replace('#<script>\s*/\* Extra runtimes[\s\S]*?</script>#', $extras, $body, 1, $replacementCount);
    if ($replacementCount === 1) { header('X-Grasstex-Source: github-modular'); echo $body; exit; }
}

/* A full local deployment can still render itself if GitHub is temporarily unavailable. */
$localEntry = $root . '/battle_sim_local.php';
if (is_file($localEntry) && is_readable($localEntry)) { require $localEntry; exit; }
header('HTTP/1.1 503 Service Unavailable');
echo '<!doctype html><html><body style="font-family:Arial;background:#111;color:#fff;padding:30px"><h1>Battle sim unavailable</h1><p>The modular battle page could not be loaded.</p></body></html>';
?>
