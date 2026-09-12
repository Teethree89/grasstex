<?php
/* 50webs production entrypoint for the Battle Sim / ww2fps AI laboratory v27.
   v27 layers source motion deltas over calibrated procedural poses.
   Runtimes are separate cache-busted files and battle/modules/*.js are discovered automatically.
   Generic commander code loads before extension modules so unit/building modules can safely add
   final behavior without being hard-coded into the commander. */
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
header('Pragma: no-cache');header('Expires: 0');header('Surrogate-Control: no-store');header('X-Grasstex-Source: modular-ai-lab-v27');
$root=dirname(__FILE__);$pagePath=$root.'/battle/battle_sim.html';
$runtimeFiles=array('battle/battle_sim.html','battle/soldier.js','battle/weapons.js','battle/terrain-features.js','battle/squad-ai.js','battle/battle-sim.js','battle/acoustics.js','battle/scenario-generator.js','battle/battle-navigation.js','battle/town-objectives.js','battle/module-registry.js','battle/ai-policy.js','battle/objective-system.js','battle/battle-telemetry.js','battle/commander-ai.js','battle/ai-trainer.js','battle/battle-control.js');
$modulePaths=glob($root.'/battle/modules/*.js');if($modulePaths===false)$modulePaths=array();sort($modulePaths,SORT_STRING);$moduleFiles=array();foreach($modulePaths as $modulePath){$name=basename($modulePath);$moduleFiles[]=$name;$runtimeFiles[]='battle/modules/'.$name;}
if(!is_file($pagePath)||!is_readable($pagePath)){http_response_code(503);echo '<!doctype html><html><body><h1>Battle sim unavailable</h1><p>Local battle page is missing.</p></body></html>';exit;}
$deployId=0;foreach($runtimeFiles as $rel){$p=$root.'/'.$rel;if(is_file($p))$deployId=max($deployId,intval(@filemtime($p)));}if($deployId<=0)$deployId=time();
$body=@file_get_contents($pagePath);if($body===false||stripos($body,'<html')===false){http_response_code(503);echo '<!doctype html><html><body><h1>Battle sim unavailable</h1><p>Local battle page could not be read.</p></body></html>';exit;}
$assetBase='https://test.ivandpopov.com/grasstex/Assets/';$audioBase=$assetBase.'audio/';$apiBase='/grasstex/';
$manifest=null;$manifestPath=$root.'/Assets/audio/manifest.json';if(is_file($manifestPath)&&is_readable($manifestPath)){$d=json_decode(@file_get_contents($manifestPath),true);if(is_array($d))$manifest=$d;}
$policyState=null;$policyPath=$root.'/state/ai-policy.json';if(is_file($policyPath)&&is_readable($policyPath)){$d=json_decode(@file_get_contents($policyPath),true);if(is_array($d))$policyState=$d;}
$memoryState=array('version'=>1,'experiences'=>array());$memoryPath=$root.'/state/scenario-memory.json';if(is_file($memoryPath)&&is_readable($memoryPath)){$d=json_decode(@file_get_contents($memoryPath),true);if(is_array($d)&&isset($d['experiences'])&&is_array($d['experiences'])){$d['experiences']=array_slice($d['experiences'],-180);$memoryState=$d;}}
$requestedSeed=isset($_GET['seed'])?substr(preg_replace('/[^a-zA-Z0-9_.-]/','-',strval($_GET['seed'])),0,100):'';
$bootstrap='<script>'.'window.BATTLE_BUILD="v27";'.'window.BATTLE_REF="local-'.$deployId.'";'.'window.BATTLE_ASSET_BASE='.json_encode($assetBase).';'.'window.BATTLE_AUDIO_BASE='.json_encode($audioBase).';'.'window.BATTLE_API_BASE='.json_encode($apiBase).';'.'window.BATTLE_AUDIO_MANIFEST='.json_encode($manifest).';'.'window.BATTLE_AI_POLICY='.json_encode($policyState).';'.'window.BATTLE_AI_MEMORY='.json_encode($memoryState).';'.'window.BATTLE_SCENARIO_SEED='.json_encode($requestedSeed).';'.'</script>';
$cdnTag='<script src="https://cdn.jsdelivr.net/npm/babylonjs@8.26.0/babylon.js"></script>';if(strpos($body,$cdnTag)===false){http_response_code(500);echo '<!doctype html><html><body><h1>Battle sim deployment mismatch</h1><p>Babylon bootstrap tag not found.</p></body></html>';exit;}$body=str_replace($cdnTag,$bootstrap."\n".$cdnTag,$body);
$coreScripts=array('soldier.js','weapons.js','terrain-features.js','squad-ai.js','battle-sim.js');foreach($coreScripts as $file){$old='<script src="'.$file.'"></script>';$new='<script src="/grasstex/battle/'.$file.'?v='.$deployId.'"></script>';$body=str_replace($old,$new,$body);}
/* Separate execution contexts mean one extension failure cannot prevent later systems loading. */
$preCommander=array('acoustics.js','scenario-generator.js','battle-navigation.js','town-objectives.js','module-registry.js','ai-policy.js','objective-system.js','battle-telemetry.js','commander-ai.js');$extras='';foreach($preCommander as $file)$extras.='<script src="/grasstex/battle/'.$file.'?v='.$deployId.'"></script>'."\n";
/* Modules load after commander: building hardpoints/armor/engineers may wrap generic behavior. */
foreach($moduleFiles as $file)$extras.='<script src="/grasstex/battle/modules/'.rawurlencode($file).'?v='.$deployId.'"></script>'."\n";
foreach(array('ai-trainer.js','battle-control.js') as $file)$extras.='<script src="/grasstex/battle/'.$file.'?v='.$deployId.'"></script>'."\n";
$pattern='#<script>\s*/\* Extra runtimes[\s\S]*?</script>#';$body=preg_replace($pattern,$extras,$body,1,$count);if($count!==1){http_response_code(500);echo '<!doctype html><html><body><h1>Battle sim deployment mismatch</h1><p>Extra-runtime block was not found.</p></body></html>';exit;}
header('X-Grasstex-Deploy-Id: '.$deployId);header('X-Grasstex-Build: v27');header('X-Grasstex-Modules: '.count($moduleFiles));echo $body;
?>
