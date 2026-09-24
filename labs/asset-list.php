<?php
/* Asset inventory for the FBX Motion Lab (labs/fbx-animation-lab.html). Lists the imported
   soldier, animation and weapon FBX files already deployed beside this page, so the lab can
   offer them in dropdowns instead of only accepting local file drops.
   Layout-agnostic: reads ../Assets/ relative to THIS file, which is correct for a local
   checkout (labs/../Assets), a branch preview (.preview/labs/../Assets) and production
   (/grasstex/labs/../Assets). */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Grasstex-Source: fbx-lab-asset-list');
$assetRoot = dirname(__DIR__) . '/Assets/';
$folders = array('soldiers' => 'soldiers', 'animations' => 'animations', 'weapons' => 'weapons');
$out = array();
foreach ($folders as $key => $dir) {
    $out[$key] = array();
    $path = $assetRoot . $dir;
    if (!is_dir($path) || !is_readable($path)) continue;
    foreach (scandir($path) as $entry) {
        /* Fixed directories, .fbx suffix only: no path traversal possible. */
        if (substr($entry, -4) !== '.fbx' || strpos($entry, '/') !== false) continue;
        if ($entry[0] === '.') continue;
        $full = $path . '/' . $entry;
        if (!is_file($full) || !is_readable($full)) continue;
        $out[$key][] = array('name' => $entry, 'bytes' => filesize($full));
    }
    usort($out[$key], function ($a, $b) { return strcasecmp($a['name'], $b['name']); });
    $out[$key] = array_map(function ($e) { return $e['name']; }, $out[$key]);
}
echo json_encode(array('assets' => $assetRoot, 'files' => $out));
