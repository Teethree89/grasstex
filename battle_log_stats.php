<?php
/* Read-only aggregate stats for Battle Sim JSONL telemetry. No raw log contents are exposed. */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(array('ok'=>false,'error'=>'GET required'));
    exit;
}

$days = isset($_GET['days']) ? intval($_GET['days']) : 7;
$days = max(1, min(30, $days));
$root = dirname(__FILE__);
$dir = $root . '/logs';
$files = is_dir($dir) ? glob($dir . '/battle-decisions-*.jsonl') : array();
if ($files === false) $files = array();
rsort($files, SORT_STRING);
$files = array_slice($files, 0, $days);

$summary = array(
    'ok'=>true,'daysRequested'=>$days,'logFiles'=>count($files),'records'=>0,'sessions'=>0,'battles'=>0,
    'liveBattles'=>0,'trainingBattles'=>0,'captures'=>0,'neutralizations'=>0,'reinforcements'=>0,
    'trainingResults'=>0,'trainingSummaries'=>0,'policyCandidates'=>0,'policyPromotions'=>0,
    'eventTypes'=>array(),'modes'=>array(),'winners'=>array('us'=>0,'ge'=>0,'draw'=>0,'none'=>0),
    'files'=>array(),'latestEvent'=>null
);
$sessions = array();
$latestTs = '';

foreach ($files as $path) {
    $daily = array('file'=>basename($path),'records'=>0,'sessions'=>array(),'battles'=>0,'captures'=>0,'trainingResults'=>0,'bytes'=>@filesize($path) ?: 0);
    $fh = @fopen($path, 'rb');
    if (!$fh) continue;
    while (($line = fgets($fh)) !== false) {
        $line = trim($line); if ($line === '') continue;
        $e = json_decode($line, true); if (!is_array($e)) continue;
        $summary['records']++; $daily['records']++;
        $type = isset($e['type']) ? strval($e['type']) : 'unknown';
        $mode = isset($e['mode']) ? strval($e['mode']) : 'unknown';
        $session = isset($e['session']) ? strval($e['session']) : '';
        if ($session !== '') { $sessions[$session] = true; $daily['sessions'][$session] = true; }
        if (!isset($summary['eventTypes'][$type])) $summary['eventTypes'][$type] = 0; $summary['eventTypes'][$type]++;
        if (!isset($summary['modes'][$mode])) $summary['modes'][$mode] = 0; $summary['modes'][$mode]++;
        $data = isset($e['data']) && is_array($e['data']) ? $e['data'] : array();

        if ($type === 'battle-end') {
            $summary['battles']++; $daily['battles']++;
            if ($mode === 'training') $summary['trainingBattles']++; else $summary['liveBattles']++;
        } elseif ($type === 'objective-captured') { $summary['captures']++; $daily['captures']++; }
        elseif ($type === 'objective-neutralized') { $summary['neutralizations']++; }
        elseif ($type === 'reinforcement' || $type === 'module-spawn') { $summary['reinforcements']++; }
        elseif ($type === 'training-result') {
            $summary['trainingResults']++; $daily['trainingResults']++;
            $winner = isset($data['winner']) ? strval($data['winner']) : 'none';
            if (!isset($summary['winners'][$winner])) $summary['winners'][$winner] = 0; $summary['winners'][$winner]++;
        } elseif ($type === 'training-summary') { $summary['trainingSummaries']++; }
        elseif ($type === 'policy-candidate') { $summary['policyCandidates']++; }
        elseif ($type === 'policy-promoted') { $summary['policyPromotions']++; }
        elseif ($type === 'objective-victory' && $mode !== 'training') {
            $winner = isset($data['winner']) ? strval($data['winner']) : 'none';
            if (!isset($summary['winners'][$winner])) $summary['winners'][$winner] = 0; $summary['winners'][$winner]++;
        }

        $ts = isset($e['serverTime']) ? strval($e['serverTime']) : (isset($e['clientTime']) ? strval($e['clientTime']) : '');
        if ($ts !== '' && $ts >= $latestTs) {
            $latestTs = $ts;
            $summary['latestEvent'] = array('time'=>$ts,'type'=>$type,'mode'=>$mode,'session'=>$session,'battleTime'=>isset($e['battleTime'])?$e['battleTime']:null);
        }
    }
    fclose($fh);
    $daily['sessions'] = count($daily['sessions']);
    $summary['files'][] = $daily;
}
$summary['sessions'] = count($sessions);
ksort($summary['eventTypes']); ksort($summary['modes']);

$policyPath = $root . '/state/ai-policy.json';
if (is_file($policyPath)) {
    $p = json_decode(@file_get_contents($policyPath), true);
    if (is_array($p)) $summary['policy'] = array('revision'=>isset($p['revision'])?$p['revision']:0,'score'=>isset($p['score'])?$p['score']:null,'trainedAt'=>isset($p['trainedAt'])?$p['trainedAt']:null,'matches'=>isset($p['matches'])?$p['matches']:null);
}

echo json_encode($summary, JSON_UNESCAPED_SLASHES);
?>
