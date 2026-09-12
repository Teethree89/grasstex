<?php
/* Append-only Battle Sim telemetry endpoint. Writes daily JSONL files under /logs/. */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(array('ok'=>false,'error'=>'POST required'));
    exit;
}

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== 'test.ivandpopov.com') {
    http_response_code(403);
    echo json_encode(array('ok'=>false,'error'=>'origin rejected'));
    exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || strlen($raw) === 0 || strlen($raw) > 262144) {
    http_response_code(400);
    echo json_encode(array('ok'=>false,'error'=>'invalid payload size'));
    exit;
}

$data = json_decode($raw, true);
$events = is_array($data) && isset($data['events']) && is_array($data['events']) ? $data['events'] : array();
if (count($events) === 0 || count($events) > 200) {
    http_response_code(400);
    echo json_encode(array('ok'=>false,'error'=>'invalid events'));
    exit;
}

$root = dirname(__FILE__);
$dir = $root . '/logs';
if (!is_dir($dir) && !@mkdir($dir, 0775, true)) {
    http_response_code(500);
    echo json_encode(array('ok'=>false,'error'=>'log directory unavailable'));
    exit;
}

$file = $dir . '/battle-decisions-' . gmdate('Y-m-d') . '.jsonl';
$lines = '';
$written = 0;
foreach ($events as $event) {
    if (!is_array($event)) continue;
    $event['serverTime'] = gmdate('c');
    $json = json_encode($event, JSON_UNESCAPED_SLASHES);
    if ($json === false) continue;
    $lines .= $json . "\n";
    $written++;
}

if ($written === 0 || @file_put_contents($file, $lines, FILE_APPEND | LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode(array('ok'=>false,'error'=>'write failed'));
    exit;
}

echo json_encode(array('ok'=>true,'written'=>$written,'file'=>basename($file)));
?>
