<?php
/* Save a per-model sidecar calibration: Assets/soldiers/<model>.json
   Body: { "model": "us-paratrooper.fbx", "data": { model, version, contacts, weapons } }
   Strict: model must be a deployed soldier FBX basename, no paths. Numbers are validated
   as finite triplets; weapon slots carry grip/foreNear/foreFar triplets (or null) plus
    optional right-hand-local leftGripR support target and armDeg shoulder/elbow/wrist triplets. Served from labs/ locally, on branch
   previews, and in production (all three deploy the whole labs/ directory). */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function fail($code, $msg) {
    http_response_code($code);
    echo json_encode(array('ok' => false, 'error' => $msg));
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') fail(405, 'POST only');
$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) fail(400, 'Invalid JSON body');
$model = $body['model'] ?? null;
$data = $body['data'] ?? null;
if (!is_string($model) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]*\.fbx$/', $model)) fail(400, 'Invalid model name');
if (!is_array($data)) fail(400, 'Missing data object');

$soldierDir = dirname(__DIR__) . '/Assets/soldiers/';
if (!is_dir($soldierDir)) fail(500, 'Soldier asset directory missing');
// Model must already exist as a deployed FBX (no new paths can be created).
if (!is_file($soldierDir . $model)) fail(404, 'Unknown soldier model: ' . $model);

function isTriplet($v) {
    if ($v === null) return true;
    if (!is_array($v) || count($v) !== 3) return false;
    foreach ($v as $n) {
        if (!is_int($n) && !is_float($n)) return false;
        if (!is_finite((float)$n)) return false;
    }
    return true;
}
$contacts = $data['contacts'] ?? null;
if (!is_array($contacts) || !array_key_exists('right', $contacts) || !array_key_exists('left', $contacts))
    fail(400, 'contacts.right/left required (triplet or null)');
if (!isTriplet($contacts['right']) || !isTriplet($contacts['left'])) fail(400, 'Bad contacts triplet');

$weapons = $data['weapons'] ?? null;
if (!is_array($weapons)) fail(400, 'weapons object required');
foreach ($weapons as $wfile => $slot) {
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]*\.fbx$/', (string)$wfile)) fail(400, 'Bad weapon name: ' . $wfile);
    if (!is_array($slot)) fail(400, 'Bad slot for ' . $wfile);
    foreach (array('grip', 'foreNear', 'foreFar') as $k) {
        if (!array_key_exists($k, $slot)) fail(400, 'Missing ' . $k . ' for ' . $wfile);
        if (!isTriplet($slot[$k])) fail(400, 'Bad ' . $k . ' for ' . $wfile);
    }
    if (isset($slot['armDeg']) && $slot['armDeg'] !== null) {
        if (!is_array($slot['armDeg'])) fail(400, 'Bad armDeg for ' . $wfile);
        foreach (array('shoulder', 'elbow', 'wrist') as $j) {
            if (isset($slot['armDeg'][$j]) && !isTriplet($slot['armDeg'][$j])) fail(400, 'Bad armDeg.' . $j . ' for ' . $wfile);
        }
    }
    /* Optional: right-wrist dial and pistol support target. Unknown extra keys pass through. */
    foreach (array('wristR', 'leftGripR') as $k) {
        if (array_key_exists($k, $slot) && $slot[$k] !== null && !isTriplet($slot[$k])) fail(400, 'Bad ' . $k . ' for ' . $wfile);
    }
}

$out = array(
    'model' => $model,
    'version' => 1,
    'contacts' => array('right' => $contacts['right'], 'left' => $contacts['left']),
    'weapons' => $weapons,
);
$tmp = $soldierDir . $model . '.json.tmp.' . getmypid();
$json = json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
if (@file_put_contents($tmp, $json, LOCK_EX) === false) fail(500, 'Could not write sidecar');
if (!@rename($tmp, $soldierDir . $model . '.json')) { @unlink($tmp); fail(500, 'Could not publish sidecar'); }
echo json_encode(array('ok' => true, 'file' => 'Assets/soldiers/' . $model . '.json',
    'weapons' => count($weapons)));
