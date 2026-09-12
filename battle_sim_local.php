<?php
/* 50webs production Battle Sim entrypoint.
   The GitHub Action deploys battle/battle_sim.html plus each battle/*.js file locally.
   This PHP serves the real battle page directly and rewrites every local runtime script to
   a cache-busted /grasstex/battle/<file>?v=<deploy-id> URL. No concatenation, document.write,
   or browser-side GitHub source fetching is used. */

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('Surrogate-Control: no-store');
header('X-Grasstex-Source: local-separate-runtime');

$root = dirname(__FILE__);
$pagePath = $root . '/battle/battle_sim.html';
$runtimeFiles = array(
    'battle/battle_sim.html',
    'battle/soldier.js',
    'battle/weapons.js',
    'battle/terrain-features.js',
    'battle/squad-ai.js',
    'battle/battle-sim.js',
    'battle/acoustics.js',
    'battle/town-objectives.js',
    'battle/commander-ai.js'
);

if (!is_file($pagePath) || !is_readable($pagePath)) {
    http_response_code(503);
    echo '<!doctype html><html><body style="font-family:Arial;background:#111;color:#fff;padding:30px"><h1>Battle sim unavailable</h1><p>Local battle/battle_sim.html is missing.</p></body></html>';
    exit;
}

/* Any deployed runtime file changing produces a new deploy id, so every local script URL changes. */
$deployId = 0;
foreach ($runtimeFiles as $rel) {
    $p = $root . '/' . $rel;
    if (is_file($p)) $deployId = max($deployId, intval(@filemtime($p)));
}
if ($deployId <= 0) $deployId = time();

$body = @file_get_contents($pagePath);
if ($body === false || stripos($body, '<html') === false) {
    http_response_code(503);
    echo '<!doctype html><html><body style="font-family:Arial;background:#111;color:#fff;padding:30px"><h1>Battle sim unavailable</h1><p>Local battle page could not be read.</p></body></html>';
    exit;
}

$assetBase = 'https://test.ivandpopov.com/grasstex/Assets/';
$audioBase = $assetBase . 'audio/';
$manifest = null;
$manifestPath = $root . '/Assets/audio/manifest.json';
if (is_file($manifestPath) && is_readable($manifestPath)) {
    $decoded = json_decode(@file_get_contents($manifestPath), true);
    if (is_array($decoded)) $manifest = $decoded;
}

$bootstrap = '<script>' .
    'window.BATTLE_BUILD="v17";' .
    'window.BATTLE_REF="local-' . $deployId . '";' .
    'window.BATTLE_ASSET_BASE=' . json_encode($assetBase) . ';' .
    'window.BATTLE_AUDIO_BASE=' . json_encode($audioBase) . ';' .
    'window.BATTLE_AUDIO_MANIFEST=' . json_encode($manifest) . ';' .
    '</script>';

$cdnTag = '<script src="https://cdn.jsdelivr.net/npm/babylonjs@8.26.0/babylon.js"></script>';
if (strpos($body, $cdnTag) === false) {
    http_response_code(500);
    echo '<!doctype html><html><body style="font-family:Arial;background:#111;color:#fff;padding:30px"><h1>Battle sim deployment mismatch</h1><p>Babylon bootstrap tag not found.</p></body></html>';
    exit;
}
$body = str_replace($cdnTag, $bootstrap . "\n" . $cdnTag, $body);

/* Core modules stay as independent browser scripts, each with the same deployment cache key. */
$scriptFiles = array('soldier.js','weapons.js','terrain-features.js','squad-ai.js','battle-sim.js');
foreach ($scriptFiles as $file) {
    $old = '<script src="' . $file . '"></script>';
    $new = '<script src="/grasstex/battle/' . $file . '?v=' . $deployId . '"></script>';
    $body = str_replace($old, $new, $body);
}

/* Replace the historical document.write/GitHub extra-runtime block with three ordinary scripts. */
$extras = '<script src="/grasstex/battle/acoustics.js?v=' . $deployId . '"></script>' . "\n" .
          '<script src="/grasstex/battle/town-objectives.js?v=' . $deployId . '"></script>' . "\n" .
          '<script src="/grasstex/battle/commander-ai.js?v=' . $deployId . '"></script>';
$pattern = '#<script>\s*/\* Extra runtimes[\s\S]*?</script>#';
$body = preg_replace($pattern, $extras, $body, 1, $count);
if ($count !== 1) {
    http_response_code(500);
    echo '<!doctype html><html><body style="font-family:Arial;background:#111;color:#fff;padding:30px"><h1>Battle sim deployment mismatch</h1><p>Extra-runtime block was not found for replacement.</p></body></html>';
    exit;
}

header('X-Grasstex-Deploy-Id: ' . $deployId);
header('X-Grasstex-Build: v17');
echo $body;
?>