<?php
/* Battle Sim / ww2fps AI lab v20 learning memory + review API.
   POST stores compact successful-scenario experiences. GET returns either memory for runtime
   adaptation or chart-ready review data. Raw telemetry lines are never exposed directly. */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$root=dirname(__FILE__);$stateDir=$root.'/state';$logDir=$root.'/logs';$memoryFile=$stateDir.'/scenario-memory.json';$policyFile=$stateDir.'/ai-policy.json';$historyFile=$logDir.'/ai-policy-history.jsonl';
function read_json_file($path,$fallback){if(!is_file($path)||!is_readable($path))return $fallback;$j=json_decode(@file_get_contents($path),true);return is_array($j)?$j:$fallback;}
function scalar_clean($v,$max=120){if(is_string($v))return substr($v,0,$max);if(is_numeric($v))return 0+$v;if(is_bool($v)||$v===null)return $v;return null;}
function clean_fingerprint($fp){
    if(!is_array($fp))return null;$vec=isset($fp['vector'])&&is_array($fp['vector'])?$fp['vector']:array();if(count($vec)<1||count($vec)>32)return null;$out=array();foreach($vec as $v){if(!is_numeric($v))return null;$out[]=max(0,min(1,floatval($v)));}
    $keys=isset($fp['keys'])&&is_array($fp['keys'])?array_slice($fp['keys'],0,32):array();$cleanKeys=array();foreach($keys as $k)$cleanKeys[]=substr(preg_replace('/[^a-zA-Z0-9_.-]/','',strval($k)),0,50);
    return array('version'=>isset($fp['version'])?intval($fp['version']):1,'keys'=>$cleanKeys,'vector'=>$out);
}
function clean_genome($g){
    if(!is_array($g))return null;$out=array('version'=>2,'parameters'=>array(),'doctrine'=>array(),'rules'=>array());
    $params=isset($g['parameters'])&&is_array($g['parameters'])?$g['parameters']:array();foreach($params as $k=>$v)if(is_numeric($v)&&count($out['parameters'])<40)$out['parameters'][substr(preg_replace('/[^a-zA-Z0-9_.-]/','',strval($k)),0,60)]=floatval($v);
    $doc=isset($g['doctrine'])&&is_array($g['doctrine'])?$g['doctrine']:array();foreach($doc as $k=>$v)if((is_numeric($v)||is_string($v))&&count($out['doctrine'])<20)$out['doctrine'][substr(preg_replace('/[^a-zA-Z0-9_.-]/','',strval($k)),0,60)]=scalar_clean($v,50);
    $rules=isset($g['rules'])&&is_array($g['rules'])?array_slice($g['rules'],0,12):array();foreach($rules as $i=>$r){if(!is_array($r))continue;$when=isset($r['when'])&&is_array($r['when'])?array_slice($r['when'],0,4):array();$cw=array();foreach($when as $w)$cw[]=substr(preg_replace('/[^a-zA-Z0-9_.-]/','',strval($w)),0,50);$out['rules'][]=array('id'=>substr(preg_replace('/[^a-zA-Z0-9_.-]/','-',isset($r['id'])?strval($r['id']):('rule-'.$i)),0,50),'when'=>$cw,'action'=>substr(preg_replace('/[^a-zA-Z0-9_.-]/','',isset($r['action'])?strval($r['action']):''),0,40),'weight'=>isset($r['weight'])&&is_numeric($r['weight'])?floatval($r['weight']):.5);}
    return $out;
}
function memory_state($path){$j=read_json_file($path,array());if(isset($j['experiences'])&&is_array($j['experiences']))return $j;return array('version'=>1,'experiences'=>array());}
function atomic_json($path,$value){$dir=dirname($path);if(!is_dir($dir)&&!@mkdir($dir,0775,true))return false;$tmp=$path.'.tmp';$encoded=json_encode($value,JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT);if($encoded===false||@file_put_contents($tmp,$encoded,LOCK_EX)===false)return false;if(!@rename($tmp,$path)){@unlink($tmp);return false;}return true;}
function jsonl_records($path,$limit=0){$out=array();if(!is_file($path)||!is_readable($path))return $out;$fh=@fopen($path,'rb');if(!$fh)return $out;while(($line=fgets($fh))!==false){$e=json_decode(trim($line),true);if(is_array($e)){$out[]=$e;if($limit>0&&count($out)>$limit)array_shift($out);}}fclose($fh);return $out;}

if($_SERVER['REQUEST_METHOD']==='POST'){
    $origin=isset($_SERVER['HTTP_ORIGIN'])?$_SERVER['HTTP_ORIGIN']:'';if($origin!==''&&parse_url($origin,PHP_URL_HOST)!=='test.ivandpopov.com'){http_response_code(403);echo json_encode(array('ok'=>false,'error'=>'origin rejected'));exit;}
    $raw=file_get_contents('php://input');if($raw===false||strlen($raw)<2||strlen($raw)>196608){http_response_code(400);echo json_encode(array('ok'=>false,'error'=>'invalid payload'));exit;}$data=json_decode($raw,true);
    if(!is_array($data)||($data['type']??'')!=='experience'||!isset($data['experience'])||!is_array($data['experience'])){http_response_code(400);echo json_encode(array('ok'=>false,'error'=>'experience required'));exit;}
    $e=$data['experience'];$fp=clean_fingerprint($e['fingerprint']??null);$genome=clean_genome($e['genome']??($e['policy']??null));if(!$fp||!$genome){http_response_code(400);echo json_encode(array('ok'=>false,'error'=>'fingerprint and genome required'));exit;}
    $clean=array('id'=>'exp-'.gmdate('YmdHis').'-'.substr(hash('sha256',json_encode(array($e['seed']??'',microtime(true)))),0,10),'storedAt'=>gmdate('c'),'seed'=>substr(strval($e['seed']??''),0,100),'scenarioId'=>substr(strval($e['scenarioId']??''),0,100),'trainingSeed'=>substr(strval($e['trainingSeed']??''),0,100),'fingerprint'=>$fp,'genome'=>$genome,'score'=>is_numeric($e['score']??null)?floatval($e['score']):0,'winner'=>substr(strval($e['winner']??'none'),0,20),'revision'=>intval($e['revision']??0),'candidateId'=>substr(strval($e['candidateId']??''),0,80));
    if(isset($e['stats'])&&is_array($e['stats'])){$clean['stats']=array();foreach(array('time','captures','neutralizations','usObjectives','geObjectives','usForceValue','geForceValue') as $k)if(isset($e['stats'][$k])&&is_numeric($e['stats'][$k]))$clean['stats'][$k]=0+$e['stats'][$k];}
    $state=memory_state($memoryFile);$state['experiences'][]=$clean;if(count($state['experiences'])>240)$state['experiences']=array_slice($state['experiences'],-240);$state['updatedAt']=gmdate('c');if(!atomic_json($memoryFile,$state)){http_response_code(500);echo json_encode(array('ok'=>false,'error'=>'memory write failed'));exit;}echo json_encode(array('ok'=>true,'experience'=>$clean,'count'=>count($state['experiences'])),JSON_UNESCAPED_SLASHES);exit;
}
if($_SERVER['REQUEST_METHOD']!=='GET'){http_response_code(405);echo json_encode(array('ok'=>false,'error'=>'GET or POST required'));exit;}

$view=isset($_GET['view'])?strval($_GET['view']):'memory';$memory=memory_state($memoryFile);
if($view==='memory'){
    /* Runtime only needs the recent compact experience library. */
    $memory['ok']=true;$memory['experiences']=array_slice($memory['experiences'],-180);echo json_encode($memory,JSON_UNESCAPED_SLASHES);exit;
}
if($view!=='dashboard'){http_response_code(400);echo json_encode(array('ok'=>false,'error'=>'unknown view'));exit;}

$days=max(1,min(30,intval($_GET['days']??14)));$files=is_dir($logDir)?glob($logDir.'/battle-decisions-*.jsonl'):array();if($files===false)$files=array();rsort($files,SORT_STRING);$files=array_slice($files,0,$days);
$matches=array();$training=array();$promotions=array();$recalls=array();$scenarioStats=array();$eventCounts=array();
foreach($files as $path){$fh=@fopen($path,'rb');if(!$fh)continue;while(($line=fgets($fh))!==false){$e=json_decode(trim($line),true);if(!is_array($e))continue;$type=strval($e['type']??'unknown');$eventCounts[$type]=($eventCounts[$type]??0)+1;$d=isset($e['data'])&&is_array($e['data'])?$e['data']:array();$base=array('time'=>$e['serverTime']??($e['clientTime']??null),'session'=>$e['session']??null,'battleTime'=>$e['battleTime']??null);
    if($type==='policy-match-result'){if(count($matches)>=160)array_shift($matches);$matches[]=array_merge($base,$d);$seed=strval($d['scenarioSeed']??'');if($seed!==''){if(!isset($scenarioStats[$seed]))$scenarioStats[$seed]=array('seed'=>$seed,'matches'=>0,'scoreSum'=>0,'wins'=>0,'losses'=>0);$scenarioStats[$seed]['matches']++;$scenarioStats[$seed]['scoreSum']+=floatval($d['score']??0);$cf=$d['candidateFaction']??'';$w=$d['winner']??'none';if($w===$cf)$scenarioStats[$seed]['wins']++;elseif($w!=='none'&&$w!=='draw')$scenarioStats[$seed]['losses']++;}}
    elseif($type==='policy-training-summary'){if(count($training)>=40)array_shift($training);$training[]=array_merge($base,$d);}
    elseif($type==='policy-promoted'){if(count($promotions)>=60)array_shift($promotions);$promotions[]=array_merge($base,$d);}
    elseif($type==='decision-scenario-recall'){if(count($recalls)>=80)array_shift($recalls);$recalls[]=array_merge($base,$d);}
}fclose($fh);}
foreach($scenarioStats as &$s)$s['avgScore']=$s['matches']?round($s['scoreSum']/$s['matches'],3):0;unset($s);usort($matches,function($a,$b){return strcmp(strval($a['time']??''),strval($b['time']??''));});usort($training,function($a,$b){return strcmp(strval($a['time']??''),strval($b['time']??''));});
$policy=read_json_file($policyFile,array('revision'=>0,'genome'=>null,'score'=>null));$history=array();foreach(jsonl_records($historyFile,80) as $h){$history[]=array('revision'=>$h['revision']??0,'score'=>$h['score']??null,'trainedAt'=>$h['trainedAt']??null,'matches'=>$h['matches']??null,'candidateId'=>$h['meta']['candidateId']??null,'trainingSeed'=>$h['meta']['trainingSeed']??null,'genome'=>$h['genome']??null);}
$experiences=array_slice($memory['experiences'],-80);usort($experiences,function($a,$b){return($b['score']??0)<=>($a['score']??0);});
$out=array('ok'=>true,'days'=>$days,'generatedAt'=>gmdate('c'),'policy'=>$policy,'policyHistory'=>$history,'matches'=>$matches,'trainingSummaries'=>$training,'promotions'=>$promotions,'recalls'=>$recalls,'scenarioStats'=>array_values($scenarioStats),'experiences'=>$experiences,'memoryCount'=>count($memory['experiences']),'eventCounts'=>$eventCounts);
echo json_encode($out,JSON_UNESCAPED_SLASHES);
?>
