<?php
/* 50webs production entrypoint for the Battle Sim / ww2fps AI laboratory.
   Core runtimes remain separate files. Extension files under battle/modules/*.js are
   discovered automatically, cache-busted, and loaded in lexical order. */

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('Surrogate-Control: no-store');
header('X-Grasstex-Source: modular-ai-lab');

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
    'battle/module-registry.js',
    'battle/ai-policy.js',
    'battle/objective-system.js',
    'battle/battle-telemetry.js',
    'battle/commander-ai.js',
    'battle/ai-trainer.js',
    'battle/battle-control.js'
);

$modulePaths = glob($root . '/battle/modules/*.js');
if ($modulePaths === false) $modulePaths = array();
sort($modulePaths, SORT_STRING);
$moduleFiles = array();
foreach ($modulePaths as $modulePath) {
    $name = basename($modulePath);
    $moduleFiles[] = $name;
    $runtimeFiles[] = 'battle/modules/' . $name;
}

if (!is_file($pagePath) || !is_readable($pagePath)) {
    http_response_code(503);
    echo '<!doctype html><html><body style="font-family:Arial;background:#111;color:#fff;padding:30px"><h1>Battle sim unavailable</h1><p>Local battle/battle_sim.html is missing.</p></body></html>';
    exit;
}

/* Any deployed runtime file changing produces a new deploy id for every script URL. */
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
$apiBase = '/grasstex/';
$manifest = null;
$manifestPath = $root . '/Assets/audio/manifest.json';
if (is_file($manifestPath) && is_readable($manifestPath)) {
    $decoded = json_decode(@file_get_contents($manifestPath), true);
    if (is_array($decoded)) $manifest = $decoded;
}
$policyState = null;
$policyPath = $root . '/state/ai-policy.json';
if (is_file($policyPath) && is_readable($policyPath)) {
    $decodedPolicy = json_decode(@file_get_contents($policyPath), true);
    if (is_array($decodedPolicy)) $policyState = $decodedPolicy;
}

$bootstrap = '<script>' .
    'window.BATTLE_BUILD="v19";' .
    'window.BATTLE_REF="local-' . $deployId . '";' .
    'window.BATTLE_ASSET_BASE=' . json_encode($assetBase) . ';' .
    'window.BATTLE_AUDIO_BASE=' . json_encode($audioBase) . ';' .
    'window.BATTLE_API_BASE=' . json_encode($apiBase) . ';' .
    'window.BATTLE_AUDIO_MANIFEST=' . json_encode($manifest) . ';' .
    'window.BATTLE_AI_POLICY=' . json_encode($policyState) . ';' .
    '</script>';

$cdnTag = '<script src="https://cdn.jsdelivr.net/npm/babylonjs@8.26.0/babylon.js"></script>';
if (strpos($body, $cdnTag) === false) {
    http_response_code(500);
    echo '<!doctype html><html><body style="font-family:Arial;background:#111;color:#fff;padding:30px"><h1>Battle sim deployment mismatch</h1><p>Babylon bootstrap tag not found.</p></body></html>';
    exit;
}
$body = str_replace($cdnTag, $bootstrap . "\n" . $cdnTag, $body);

$coreScripts = array('soldier.js','weapons.js','terrain-features.js','squad-ai.js','battle-sim.js');
foreach ($coreScripts as $file) {
    $old = '<script src="' . $file . '"></script>';
    $new = '<script src="/grasstex/battle/' . $file . '?v=' . $deployId . '"></script>';
    $body = str_replace($old, $new, $body);
}

/* Independent runtimes: one module throwing cannot prevent later files from loading. */
$extraFiles = array(
    'acoustics.js',
    'town-objectives.js',
    'module-registry.js',
    'ai-policy.js',
    'objective-system.js'
);
$extras = '';
foreach ($extraFiles as $file) $extras .= '<script src="/grasstex/battle/' . $file . '?v=' . $deployId . '"></script>' . "\n";
foreach ($moduleFiles as $file) $extras .= '<script src="/grasstex/battle/modules/' . rawurlencode($file) . '?v=' . $deployId . '"></script>' . "\n";
$tailFiles = array('battle-telemetry.js','commander-ai.js','ai-trainer.js','battle-control.js');
foreach ($tailFiles as $file) $extras .= '<script src="/grasstex/battle/' . $file . '?v=' . $deployId . '"></script>' . "\n";

$pattern = '#<script>\s*/\* Extra runtimes[\s\S]*?</script>#';
$body = preg_replace($pattern, $extras, $body, 1, $count);
if ($count !== 1) {
    http_response_code(500);
    echo '<!doctype html><html><body style="font-family:Arial;background:#111;color:#fff;padding:30px"><h1>Battle sim deployment mismatch</h1><p>Extra-runtime block was not found for replacement.</p></body></html>';
    exit;
}

header('X-Grasstex-Deploy-Id: ' . $deployId);
header('X-Grasstex-Build: v19');
header('X-Grasstex-Modules: ' . count($moduleFiles));
echo $body;
?>
