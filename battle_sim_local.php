<?php
/* 50webs production entrypoint.
   The GitHub Action deploys battle_sim.html plus battle/*.js beside this file. This PHP serves
   that local loader and rewrites its source fetcher to use the deployed files on the same host.
   GitHub is used at deployment time only, never in the browser boot path. */

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('Surrogate-Control: no-store');
header('X-Grasstex-Source: local-deployed-runtime');

$root = dirname(__FILE__);
$loaderPath = $root . '/battle_sim.html';
if (!is_file($loaderPath) || !is_readable($loaderPath)) {
    http_response_code(503);
    echo '<!doctype html><html><body style="font-family:Arial;background:#111;color:#fff;padding:30px"><h1>Battle sim unavailable</h1><p>Local battle_sim.html is missing.</p></body></html>';
    exit;
}

$body = file_get_contents($loaderPath);
if ($body === false || stripos($body, '<html') === false) {
    http_response_code(503);
    echo '<!doctype html><html><body style="font-family:Arial;background:#111;color:#fff;padding:30px"><h1>Battle sim unavailable</h1><p>Local battle_sim.html could not be read.</p></body></html>';
    exit;
}

/* Stable local deployment id. Changing any deployed loader file changes its mtime and therefore
   the query string used for every script fetch. */
$deployId = (string) @filemtime($loaderPath);
if ($deployId === '' || $deployId === '0') $deployId = (string) time();

$oldRef = "const REF=new URLSearchParams(location.search).get('ref')||'main';";
$newRef = "const REF='local-" . $deployId . "';";
$body = str_replace($oldRef, $newRef, $body);

$oldGrab = "const grab=async(path)=>{const r=await fetch(REPO+REF+'/'+path+'?ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error(path+' -> HTTP '+r.status);return r.text();};";
$newGrab = "const grab=async(path)=>{const r=await fetch('/grasstex/'+path+'?v=" . $deployId . "&ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error(path+' -> HTTP '+r.status);return r.text();};";
$body = str_replace($oldGrab, $newGrab, $body);

/* Make failures obvious if a future loader edit changes one of the exact replacement targets. */
if (strpos($body, $newRef) === false || strpos($body, "fetch('/grasstex/'+path") === false) {
    http_response_code(500);
    echo '<!doctype html><html><body style="font-family:Arial;background:#111;color:#fff;padding:30px"><h1>Battle sim deployment mismatch</h1><p>The local loader format changed and the PHP rewrite needs updating.</p></body></html>';
    exit;
}

header('X-Grasstex-Deploy-Id: ' . $deployId);
echo $body;
?>