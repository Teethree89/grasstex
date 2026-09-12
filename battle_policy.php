<?php
/* Persistent AI policy endpoint. GET returns the current learned tactical policy; POST stores
   a validated promoted policy and appends an audit record. */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$root = dirname(__FILE__);
$stateDir = $root . '/state';
$stateFile = $stateDir . '/ai-policy.json';
$logDir = $root . '/logs';
$historyFile = $logDir . '/ai-policy-history.jsonl';
$ranges = array(
    'cohesionRadius'=>array(22,50),'captainlessCohesion'=>array(18,38),'regroupHold'=>array(.15,1.2),'cornerHold'=>array(.2,1.8),'cornerNoCaptainExtra'=>array(0,1.2),
    'supportDelay'=>array(0,45),'sectorNeutralNeed'=>array(35,120),'sectorEnemyNeed'=>array(60,170),'sectorActiveBonus'=>array(0,40),'sectorDistanceWeight'=>array(.2,1.1),
    'routeArrivalRadius'=>array(5,14),'finalRouteRadius'=>array(8,24),'captureCommitRatio'=>array(.55,.98),'contactDistance'=>array(16,48),'townBoundary'=>array(45,75),
    'engagedRallyAdvance'=>array(.04,.34),'pressObjectiveMinDistance'=>array(3,14),'pressEnemyClearance'=>array(18,65),'scoutLead'=>array(0,10),'gunnerTrail'=>array(0,8),
    'objectiveHoldWin'=>array(20,60),'decisionSnapshotSeconds'=>array(3,12)
);

function read_policy_state($path) {
    if (!is_file($path) || !is_readable($path)) return null;
    $j = json_decode(@file_get_contents($path), true);
    return is_array($j) ? $j : null;
}
function sanitize_meta($meta) {
    if (!is_array($meta)) return array();
    $allowed = array('score','matches','baselineScore','candidateId','generation','notes','sourceBuild');
    $out = array();
    foreach ($allowed as $k) if (isset($meta[$k]) && (is_scalar($meta[$k]) || $meta[$k] === null)) $out[$k] = $meta[$k];
    return $out;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $state = read_policy_state($stateFile);
    if (!$state) { echo json_encode(array('ok'=>true,'revision'=>0,'policy'=>null)); exit; }
    $state['ok'] = true; echo json_encode($state, JSON_UNESCAPED_SLASHES); exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); echo json_encode(array('ok'=>false,'error'=>'GET or POST required')); exit;
}

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== 'test.ivandpopov.com') {
    http_response_code(403); echo json_encode(array('ok'=>false,'error'=>'origin rejected')); exit;
}
$raw = file_get_contents('php://input');
if ($raw === false || strlen($raw) === 0 || strlen($raw) > 65536) {
    http_response_code(400); echo json_encode(array('ok'=>false,'error'=>'invalid payload size')); exit;
}
$data = json_decode($raw, true);
$policy = is_array($data) && isset($data['policy']) && is_array($data['policy']) ? $data['policy'] : null;
if (!$policy) { http_response_code(400); echo json_encode(array('ok'=>false,'error'=>'policy required')); exit; }

$clean = array();
foreach ($ranges as $k=>$range) {
    if (!array_key_exists($k, $policy) || !is_numeric($policy[$k])) { http_response_code(400); echo json_encode(array('ok'=>false,'error'=>'missing/invalid '.$k)); exit; }
    $v = floatval($policy[$k]);
    if ($v < $range[0] || $v > $range[1]) { http_response_code(400); echo json_encode(array('ok'=>false,'error'=>'out of range '.$k)); exit; }
    $clean[$k] = $v;
}

$current = read_policy_state($stateFile);
$currentRevision = $current && isset($current['revision']) ? intval($current['revision']) : 0;
$baseRevision = is_array($data) && isset($data['baseRevision']) ? intval($data['baseRevision']) : -1;
if ($baseRevision !== $currentRevision) {
    http_response_code(409);
    echo json_encode(array('ok'=>false,'error'=>'stale policy revision','currentRevision'=>$currentRevision,'current'=>$current), JSON_UNESCAPED_SLASHES);
    exit;
}
$revision = $currentRevision + 1;
$meta = sanitize_meta(isset($data['meta']) ? $data['meta'] : array());
$record = array(
    'revision'=>$revision,
    'policy'=>$clean,
    'score'=>isset($meta['score']) ? floatval($meta['score']) : null,
    'matches'=>isset($meta['matches']) ? intval($meta['matches']) : null,
    'trainedAt'=>gmdate('c'),
    'meta'=>$meta
);
if (!is_dir($stateDir) && !@mkdir($stateDir, 0775, true)) { http_response_code(500); echo json_encode(array('ok'=>false,'error'=>'state directory unavailable')); exit; }
$tmp = $stateFile . '.tmp';
$encoded = json_encode($record, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
if ($encoded === false || @file_put_contents($tmp, $encoded, LOCK_EX) === false || !@rename($tmp, $stateFile)) {
    @unlink($tmp); http_response_code(500); echo json_encode(array('ok'=>false,'error'=>'policy write failed')); exit;
}
if (!is_dir($logDir)) @mkdir($logDir, 0775, true);
$history = $record; $history['event'] = 'policy-promoted';
@file_put_contents($historyFile, json_encode($history, JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
$record['ok'] = true; echo json_encode($record, JSON_UNESCAPED_SLASHES);
?>
