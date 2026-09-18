<?php
/* 50webs production entrypoint for the Battle Sim / ww2fps AI laboratory. Deployed as
   /grasstex/battle_sim.php (see scripts/prepare_incremental_deploy.py), so this - not the
   GitHub-proxy battle_sim.php in the repository root - is what serves normal play.
   The build number comes from the deploy workflow's git tag; see scripts/build_version.py.
   v29 gave individual combat a single owner: battle/engagement.js decides contact, cover, stance
   and permission to fire, and the cover field is dense enough for those drills to have somewhere
   to go. See battle/AI_ENGAGEMENT.md.
   Runtimes are separate cache-busted files and battle/modules/*.js are discovered automatically.
   Generic commander code loads before extension modules so unit/building modules can safely add
   final behavior without being hard-coded into the commander. */
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
header('Pragma: no-cache');header('Expires: 0');header('Surrogate-Control: no-store');header('X-Grasstex-Source: modular-ai-lab-v29');
$root=dirname(__FILE__);
/* Branch previews: the preview deploy workflow copies a branch runtime to /grasstex/preview/<slug>/
   with a preview.json marker. The same loader then serves that directory's runtime, reads production
   assets/policy/memory, and the page makes no telemetry, policy or learning writes. */
$preview=null;$previewPath=$root.'/preview.json';
if(is_file($previewPath)&&is_readable($previewPath)){$d=json_decode(@file_get_contents($previewPath),true);if(is_array($d))$preview=$d;}
$runtimeBase=$preview?rtrim(str_replace('\\','/',dirname($_SERVER['SCRIPT_NAME'])),'/').'/':'/grasstex/';
$stateRoot=$preview?dirname(dirname($root)):$root;
/* Build identity.
   The deploy workflow owns the build number: it reads the highest build-v<N> git tag, stamps N+1
   into battle/build-version.json, uploads that with the runtime, and only tags N+1 once the deploy
   has succeeded. So the file next to this loader is what is actually live, and the constants below
   are just the fallback for a hand-placed deployment with no version file.
   The cache epoch carries the commit, so every deploy busts every client's cached runtime and a
   redeploy of the same version number still busts it. */
$build = 'v29-dev';
$cacheEpoch = 'v29-dev';
$buildSource = 'fallback';
$versionFile = $root . '/battle/build-version.json';
if (is_file($versionFile) && is_readable($versionFile)) {
    $decodedVersion = json_decode(@file_get_contents($versionFile), true);
    if (is_array($decodedVersion) && isset($decodedVersion['version']) && preg_match('/^[0-9A-Za-z._-]{1,32}$/', $decodedVersion['version'])) {
        $build = $decodedVersion['version'];
        $epoch = isset($decodedVersion['cacheEpoch']) ? $decodedVersion['cacheEpoch'] : $build;
        $cacheEpoch = preg_match('/^[0-9A-Za-z._-]{1,64}$/', $epoch) ? $epoch : $build;
        $buildSource = 'tag';
    }
}
if ($preview && isset($preview['sha']) && preg_match('/^[0-9a-f]{7,40}$/i', $preview['sha'])) {
    $build = 'preview-' . substr($preview['sha'], 0, 7);
    $cacheEpoch = $build;
    $buildSource = 'preview';
}

$pagePath=$root.'/battle/battle_sim.html';
$runtimeFiles=array('battle/battle_sim.html','battle/soldier.js','battle/weapons.js','battle/obstacle-field.js','battle/terrain-features.js','battle/squad-ai.js','battle/engagement.js','battle/battle-sim.js','battle/camera-controls.js','battle/acoustics.js','battle/scenario-generator.js','battle/battle-navigation.js','battle/town-objectives.js','battle/module-registry.js','battle/ai-policy.js','battle/objective-system.js','battle/battle-telemetry.js','battle/commander-doctrine.js','battle/commander-routes.js','battle/commander-ai.js','battle/ai-trainer.js','battle/battle-control.js');
$modulePaths=glob($root.'/battle/modules/*.js');if($modulePaths===false)$modulePaths=array();sort($modulePaths,SORT_STRING);$moduleFiles=array();foreach($modulePaths as $modulePath){$name=basename($modulePath);$moduleFiles[]=$name;$runtimeFiles[]='battle/modules/'.$name;}
if(!is_file($pagePath)||!is_readable($pagePath)){http_response_code(503);echo '<!doctype html><html><body><h1>Battle sim unavailable</h1><p>Local battle page is missing.</p></body></html>';exit;}
$deployId=0;foreach($runtimeFiles as $rel){$p=$root.'/'.$rel;if(is_file($p))$deployId=max($deployId,intval(@filemtime($p)));}if($deployId<=0)$deployId=time();
$body=@file_get_contents($pagePath);if($body===false||stripos($body,'<html')===false){http_response_code(503);echo '<!doctype html><html><body><h1>Battle sim unavailable</h1><p>Local battle page could not be read.</p></body></html>';exit;}
$apiBase='/grasstex/';
/* Assets are served from this page's own origin. Pointing them at the public host meant the
   headless benchmark, which serves this file from 127.0.0.1, failed every texture, acoustics
   and weapon-audio fetch on CORS - ~1,700 console errors per 100-battle run, which is what the
   "browser/runtime errors" metric was actually counting, and which would have buried a real
   exception. Same-origin is also correct for the deployed copy, where /grasstex/Assets/ is the
   same directory this loader lives beside. */
$assetBase=$apiBase.'Assets/';$audioBase=$assetBase.'audio/';
$manifest=null;$manifestPath=$stateRoot.'/Assets/audio/manifest.json';if(is_file($manifestPath)&&is_readable($manifestPath)){$d=json_decode(@file_get_contents($manifestPath),true);if(is_array($d))$manifest=$d;}
$policyState=null;$policyPath=$stateRoot.'/state/ai-policy.json';if(is_file($policyPath)&&is_readable($policyPath)){$d=json_decode(@file_get_contents($policyPath),true);if(is_array($d))$policyState=$d;}
$memoryState=array('version'=>1,'experiences'=>array());$memoryPath=$stateRoot.'/state/scenario-memory.json';if(is_file($memoryPath)&&is_readable($memoryPath)){$d=json_decode(@file_get_contents($memoryPath),true);if(is_array($d)&&isset($d['experiences'])&&is_array($d['experiences'])){$d['experiences']=array_slice($d['experiences'],-180);$memoryState=$d;}}
$requestedSeed=isset($_GET['seed'])?substr(preg_replace('/[^a-zA-Z0-9_.-]/','-',strval($_GET['seed'])),0,100):'';
$requestedDefender=(isset($_GET['defender'])&&in_array($_GET['defender'],array('us','ge'),true))?$_GET['defender']:'';
$bootstrap='<script>'.'window.BATTLE_BUILD_DEPLOYED='.json_encode($build).';'.'window.BATTLE_REF="local-'.$deployId.'";'.'window.BATTLE_ASSET_BASE='.json_encode($assetBase).';'.'window.BATTLE_AUDIO_BASE='.json_encode($audioBase).';'.'window.BATTLE_API_BASE='.json_encode($apiBase).';'.'window.BATTLE_PREVIEW='.json_encode($preview).';'.'window.BATTLE_AUDIO_MANIFEST='.json_encode($manifest).';'.'window.BATTLE_AI_POLICY='.json_encode($policyState).';'.'window.BATTLE_AI_MEMORY='.json_encode($memoryState).';'.'window.BATTLE_SCENARIO_SEED='.json_encode($requestedSeed).';'.'</script>';
$cdnTag='<script src="https://cdn.jsdelivr.net/npm/babylonjs@8.26.0/babylon.js"></script>';if(strpos($body,$cdnTag)===false){http_response_code(500);echo '<!doctype html><html><body><h1>Battle sim deployment mismatch</h1><p>Babylon bootstrap tag not found.</p></body></html>';exit;}$body=str_replace($cdnTag,$bootstrap."\n".$cdnTag,$body);
$coreScripts=array('soldier.js','weapons.js','obstacle-field.js','terrain-features.js','squad-ai.js','movement-resolver.js','engagement.js','battle-sim.js');foreach($coreScripts as $file){$old='<script src="'.$file.'"></script>';$new='<script src="'.$runtimeBase.'battle/'.$file.'?v='.$deployId.'&c='.rawurlencode($cacheEpoch).'"></script>';$body=str_replace($old,$new,$body);}
/* The checked-in page keeps a touch-friendly ArcRotate fallback. Production swaps only that camera
   bootstrap for the ww2fps Model Lab fly controller; all battle/player logic remains untouched. */
/* Version-agnostic on purpose: the page stamps its own build into that log line, so pinning the
   version here made every build bump a 500. */
$cameraPattern='#  var target=new BABYLON\.Vector3\(scenario\.center\.x,4,scenario\.center\.z\),camera=new BABYLON\.ArcRotateCamera[\s\S]*?WASD pan enabled\'\);#';
$cameraReplacement="  var cameraSetup=window.BattleDesktopCamera.create({canvas:canvas,scene:scene,scenario:scenario,engine:engine,battleSim:BattleSim}),camera=cameraSetup.camera;document.getElementById('cameraHint').textContent=cameraSetup.hint;";
$body=preg_replace($cameraPattern,$cameraReplacement,$body,1,$cameraCount);if($cameraCount!==1){http_response_code(500);echo '<!doctype html><html><body><h1>Battle sim deployment mismatch</h1><p>Camera bootstrap block was not found.</p></body></html>';exit;}
/* Separate execution contexts mean one extension failure cannot prevent later systems loading. */
$preCommander=array('camera-controls.js','acoustics.js','scenario-generator.js','battle-navigation.js','town-objectives.js','module-registry.js','ai-policy.js','objective-system.js','battle-telemetry.js','commander-doctrine.js','commander-routes.js','commander-ai.js');$extras='';foreach($preCommander as $file)$extras.='<script src="'.$runtimeBase.'battle/'.$file.'?v='.$deployId.'&c='.rawurlencode($cacheEpoch).'"></script>'."\n";
/* Modules load after commander: building hardpoints/armor/engineers may wrap generic behavior. */
foreach($moduleFiles as $file)$extras.='<script src="'.$runtimeBase.'battle/modules/'.rawurlencode($file).'?v='.$deployId.'&c='.rawurlencode($cacheEpoch).'"></script>'."\n";
/* Benchmark/repro URLs may choose a prepared defender without relying on UI state. Defender UI
   installation runs while modules load, so apply this after the module tags and before the page
   creates/restarts the battle. Empty means the normal meeting engagement. */
$defenderValue=$requestedDefender!==''?$requestedDefender:null;
$extras.='<script>(function(){var d='.json_encode($defenderValue).';window.BATTLE_DEFENDER=d;var u=document.getElementById("usDefenderToggle"),g=document.getElementById("geDefenderToggle");if(u)u.checked=d==="us";if(g)g.checked=d==="ge";})();</script>'."\n";
foreach(array('ai-trainer.js','battle-control.js') as $file)$extras.='<script src="'.$runtimeBase.'battle/'.$file.'?v='.$deployId.'&c='.rawurlencode($cacheEpoch).'"></script>'."\n";
$pattern='#<script>\s*/\* Extra runtimes[\s\S]*?</script>#';$body=preg_replace($pattern,$extras,$body,1,$count);if($count!==1){http_response_code(500);echo '<!doctype html><html><body><h1>Battle sim deployment mismatch</h1><p>Extra-runtime block was not found.</p></body></html>';exit;}
header('X-Grasstex-Deploy-Id: '.$deployId);header('X-Grasstex-Build: '.$build);header('X-Grasstex-Build-Source: '.$buildSource);header('X-Grasstex-Cache-Epoch: '.$cacheEpoch);header('X-Grasstex-Modules: '.count($moduleFiles));echo $body;
?>
