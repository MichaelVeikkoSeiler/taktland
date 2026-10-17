<?php
/**
 * Fügt die Verzeichnisse der Kantone (gebaeude/index-*.json, baeume/index-*.json) zu gebaeude/index.json und
 * baeume/index.json zusammen, wie holen.php am Ende, ohne etwas zu laden (Michael, 2026-10-17: nach holen.php fehlte
 * gebaeude/index.json). Zeigt, was es vorfindet, und löscht sich danach selbst.
 *
 * In public_html/daten hochladen und https://daten.taktland.ch/zusammen.php öffnen.
 */
header('Content-Type: text/html; charset=utf-8');
$h = fn($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
$zeilen = [];
$fehlt = false;
foreach (['gebaeude' => '.bgz', 'baeume' => '.bmd'] as $ordner => $endung) {
    $pfad = __DIR__ . '/' . $ordner;
    if (!is_dir($pfad)) { $zeilen[] = "<b>$ordner/</b>: Ordner fehlt."; $fehlt = true; continue; }
    $kacheln = count(glob($pfad . '/*' . $endung) ?: []);
    $alle = null; $kantone = [];
    foreach (glob($pfad . '/index-*.json') ?: [] as $datei) {
        $ix = json_decode(file_get_contents($datei), true);
        if (!$ix) continue;
        if ($alle === null) { $alle = $ix; $alle['strecken'] = []; $alle['kantone'] = []; $alle['kacheln'] = []; }
        if (isset($ix['kanton'])) $kantone[] = $ix['kanton'];
        // + statt array_merge: Namen wie 5170_2395 bleiben Schlüssel
        $alle['kacheln'] = $alle['kacheln'] + ($ix['kacheln'] ?? []);
    }
    if ($alle === null) { $zeilen[] = "<b>$ordner/</b>: $kacheln Kacheln, aber kein index-*.json."; $fehlt = true; continue; }
    // ohne Kacheln kein Verzeichnis: sonst suchte die App Dateien, die es nicht gibt
    if ($kacheln === 0) { $zeilen[] = "<b>$ordner/</b>: Verzeichnisse da, aber keine Kacheln ($endung); index.json nicht geschrieben."; $fehlt = true; continue; }
    unset($alle['kanton']);
    $alle['kantone'] = $kantone;
    ksort($alle['kacheln']);
    $ok = file_put_contents($pfad . '/index.json', json_encode($alle, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $zeilen[] = "<b>$ordner/</b>: $kacheln Kacheln, " . count($kantone) . ' Kantone (' . $h(implode(', ', $kantone)) . '), '
        . count($alle['kacheln']) . ' Einträge im Verzeichnis' . ($ok ? ', index.json geschrieben.' : ', index.json liess sich NICHT schreiben.');
    if (!$ok) $fehlt = true;
}
if (!$fehlt) @unlink(__FILE__);
echo '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Taktland Daten</title>';
echo '<body style="font-family:Helvetica,Arial,sans-serif;margin:24px"><h1 style="font-size:22px">'
    . ($fehlt ? 'Nicht vollständig' : 'Fertig') . '</h1><p>' . implode('<br>', $zeilen) . '</p>'
    . ($fehlt ? '<p>Das Skript bleibt liegen. Bitte ein Bildschirmfoto davon schicken.</p>' : '<p>Das Skript hat sich gelöscht.</p>') . '</body>';
