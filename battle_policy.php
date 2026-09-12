<?php
/* Persistent AI Policy Genome v2 endpoint. GET returns the learned genome. POST accepts only
   validated numeric doctrine/parameters and constrained rule vocabulary; arbitrary code is never
   stored or executed. Old v19 flat-policy state remains readable and is upgraded client-side. */
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
    'routeArrivalRadius'=>array(5,14),'finalRouteRadius'=>array(8,24),'captureCommitRatio'=>array(.55,.98),'contactDistance'=>array(16,48),'townBoundary'=>array(45,95),
    'engagedRallyAdvance'=>array(.04,.34),'pressObjectiveMinDistance'=>array(3,14),'pressEnemyClearance'=>array(18,65),'scoutLead'=>array(0,10),'gunnerTrail'=>array(0,8),
    'objectiveHoldWin'=>array(20,60),'decisionSnapshotSeconds'=>array(3,12)
);
$doctrineRanges = array('reserveFraction'=>array(0,.42),'localSuperiority'=>array(.75,2.1),'flankPreference'=>array(0,1),'defenseCommitment'=>array(0,1),'riskTolerance'=>array(0,1));
$strategies = array('balanced','nearest','highest-value','weakest-pressure','sequential');
$conditions = array('objectiveNeutral','objectiveEnemy','objectiveOwned','enemyNear','outnumbered','notOutnumbered','captainDead','supportRole','insideObjective','underPressure');
$actions = array('assault','flank','defend','hold','regroup','support');

function read_policy_state($path) {
    if (!is_file($path) || !is_readable($path)) return null;
    $j = json_decode(@file_get_contents($path), true);
    return is_array($j) ? $j : null;
}
function sanitize_meta($meta) {
    if (!is_array($meta)) return array();
    $allowed = array('score','matches','baselineScore','candidateId','generation','notes','sourceBuild','trainingSeed','scenarioCount','validationScore','noveltyScore');
    $out = array();
    foreach ($allowed as $k) if (isset($meta[$k]) && (is_scalar($meta[$k]) || $meta[$k] === null)) $out[$k] = $meta[$k];
    return $out;
}
function bad_request($message) { http_response_code(400); echo json_encode(array('ok'=>false,'error'=>$message)); exit; }
function validate_parameters($src, $ranges) {
    if (!is_array($src)) bad_request('genome parameters required');
    $out = array();
    foreach ($ranges as $k=>$range) {
        if (!array_key_exists($k,$src) || !is_numeric($src[$k])) bad_request('missing/invalid parameter '.$k);
        $v = floatval($src[$k]); if ($v<$range[0] || $v>$range[1]) bad_request('out of range parameter '.$k); $out[$k]=$v;
    }
    return $out;
}
function validate_doctrine($src, $ranges, $strategies) {
    if (!is_array($src)) bad_request('genome doctrine required'); $out=array();
    foreach ($ranges as $k=>$range) { if (!array_key_exists($k,$src) || !is_numeric($src[$k])) bad_request('missing/invalid doctrine '.$k); $v=floatval($src[$k]); if($v<$range[0]||$v>$range[1]) bad_request('out of range doctrine '.$k); $out[$k]=$v; }
    $strategy = isset($src['objectiveStrategy']) ? strval($src['objectiveStrategy']) : '';
    if (!in_array($strategy,$strategies,true)) bad_request('invalid objective strategy'); $out['objectiveStrategy']=$strategy; return $out;
}
function validate_rules($src, $conditions, $actions) {
    if (!is_array($src) || count($src)<1 || count($src)>12) bad_request('genome rules must contain 1..12 rules');
    $out=array();$seen=array();
    foreach ($src as $i=>$r) {
        if (!is_array($r)) bad_request('invalid rule '.$i);
        $id=isset($r['id'])?strval($r['id']):('rule-'.$i);$id=preg_replace('/[^a-zA-Z0-9_.-]/','-',$id);$id=substr($id,0,50);if($id==='')$id='rule-'.$i;
        if(isset($seen[$id]))$id.='-'.$i;$seen[$id]=true;
        $when=isset($r['when'])&&is_array($r['when'])?$r['when']:array();if(count($when)<1||count($when)>4)bad_request('rule '.$id.' must have 1..4 conditions');$cleanWhen=array();
        foreach($when as $condition){$condition=strval($condition);if(!in_array($condition,$conditions,true))bad_request('invalid rule condition '.$condition);if(!in_array($condition,$cleanWhen,true))$cleanWhen[]=$condition;}
        $action=isset($r['action'])?strval($r['action']):'';if(!in_array($action,$actions,true))bad_request('invalid rule action '.$action);
        $weight=isset($r['weight'])&&is_numeric($r['weight'])?floatval($r['weight']):0;if($weight<.05||$weight>1)bad_request('invalid rule weight '.$id);
        $out[]=array('id'=>$id,'when'=>$cleanWhen,'action'=>$action,'weight'=>$weight);
    }
    return $out;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $state=read_policy_state($stateFile);if(!$state){echo json_encode(array('ok'=>true,'revision'=>0,'genome'=>null,'policy'=>null));exit;}$state['ok']=true;echo json_encode($state,JSON_UNESCAPED_SLASHES);exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(array('ok'=>false,'error'=>'GET or POST required')); exit; }
$origin=isset($_SERVER['HTTP_ORIGIN'])?$_SERVER['HTTP_ORIGIN']:'';if($origin===''||parse_url($origin,PHP_URL_HOST)!=='test.ivandpopov.com'){http_response_code(403);echo json_encode(array('ok'=>false,'error'=>'same-origin request required'));exit;}
$raw=file_get_contents('php://input');if($raw===false||strlen($raw)===0||strlen($raw)>131072)bad_request('invalid payload size');$data=json_decode($raw,true);if(!is_array($data))bad_request('invalid JSON');

/* Prefer Genome v2. Old flat policy POST remains accepted for migration only. */
if(isset($data['genome'])&&is_array($data['genome'])){
    $g=$data['genome'];$parameters=validate_parameters(isset($g['parameters'])?$g['parameters']:null,$ranges);$doctrine=validate_doctrine(isset($g['doctrine'])?$g['doctrine']:null,$doctrineRanges,$strategies);$rules=validate_rules(isset($g['rules'])?$g['rules']:null,$conditions,$actions);$genome=array('version'=>2,'parameters'=>$parameters,'doctrine'=>$doctrine,'rules'=>$rules);
}else if(isset($data['policy'])&&is_array($data['policy'])){
    $parameters=validate_parameters($data['policy'],$ranges);$genome=array('version'=>1,'parameters'=>$parameters,'doctrine'=>null,'rules'=>null);
}else bad_request('genome required');

$current=read_policy_state($stateFile);$currentRevision=$current&&isset($current['revision'])?intval($current['revision']):0;$baseRevision=isset($data['baseRevision'])?intval($data['baseRevision']):-1;
if($baseRevision!==$currentRevision){http_response_code(409);echo json_encode(array('ok'=>false,'error'=>'stale policy revision','currentRevision'=>$currentRevision,'current'=>$current),JSON_UNESCAPED_SLASHES);exit;}
$revision=$currentRevision+1;$meta=sanitize_meta(isset($data['meta'])?$data['meta']:array());
$record=array('revision'=>$revision,'genome'=>$genome,'policy'=>$genome['parameters'],'score'=>isset($meta['score'])?floatval($meta['score']):null,'matches'=>isset($meta['matches'])?intval($meta['matches']):null,'trainedAt'=>gmdate('c'),'meta'=>$meta);
if(!is_dir($stateDir)&&!@mkdir($stateDir,0775,true)){http_response_code(500);echo json_encode(array('ok'=>false,'error'=>'state directory unavailable'));exit;}
$tmp=$stateFile.'.tmp';$encoded=json_encode($record,JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT);if($encoded===false||@file_put_contents($tmp,$encoded,LOCK_EX)===false||!@rename($tmp,$stateFile)){@unlink($tmp);http_response_code(500);echo json_encode(array('ok'=>false,'error'=>'policy write failed'));exit;}
if(!is_dir($logDir))@mkdir($logDir,0775,true);$history=$record;$history['event']='policy-promoted';@file_put_contents($historyFile,json_encode($history,JSON_UNESCAPED_SLASHES)."\n",FILE_APPEND|LOCK_EX);
$record['ok']=true;echo json_encode($record,JSON_UNESCAPED_SLASHES);
?>
