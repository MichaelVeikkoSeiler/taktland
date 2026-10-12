<?php
/**
 * Holt die Pakete der scharfen Umgebung vom GitHub-Release «scharf-1» direkt auf daten.taktland.ch und packt sie aus
 * (Michael, 2026-10-12: «so viel Details wie möglich»), ohne Gigabytes von Hand herunter- und hochzuladen. Die Pakete
 * baut der Workflow «Scharfe Umgebung» (.github/workflows/scharf.yml).
 *
 * Einmal in public_html/daten hochladen und https://daten.taktland.ch/holen.php öffnen: je Aufruf ein Paket, die Seite
 * lädt sich selbst neu, bis alle da sind. Zuletzt fügt es die Verzeichnisse der Reihen (scharf/index-*.json) zu
 * scharf/index.json zusammen, erst dann sieht die App die neuen Kacheln, und löscht sich selbst.
 */
const RELEASE = 'https://api.github.com/repos/MichaelVeikkoSeiler/taktland/releases/tags/scharf-1';

header('Content-Type: text/html; charset=utf-8');
set_time_limit(900);
$nr = isset($_GET['teil']) ? max(0, (int) $_GET['teil']) : 0;
$h = fn($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');

function seite($titel, $text, $weiter = null) {
    echo '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Taktland Daten</title>';
    if ($weiter !== null) echo '<meta http-equiv="refresh" content="1;url=?teil=' . (int) $weiter . '">';
    echo '<body style="font-family:Helvetica,Arial,sans-serif;margin:24px">';
    echo '<h1 style="font-size:22px">' . $titel . '</h1><p>' . $text . '</p></body>';
    exit;
}

function abrufen($url, $datei = null) {
    $ch = curl_init($url);
    $fp = $datei ? fopen($datei, 'w') : null;
    curl_setopt_array($ch, [CURLOPT_FOLLOWLOCATION => true, CURLOPT_FAILONERROR => true, CURLOPT_CONNECTTIMEOUT => 30,
        CURLOPT_TIMEOUT => 800, CURLOPT_USERAGENT => 'taktland-daten', CURLOPT_HTTPHEADER => ['Accept: application/vnd.github+json']]);
    if ($fp) curl_setopt($ch, CURLOPT_FILE, $fp); else curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $raus = curl_exec($ch);
    $fehler = $raus === false ? curl_error($ch) : null;
    curl_close($ch);
    if ($fp) fclose($fp);
    return [$raus, $fehler];
}

if (!class_exists('ZipArchive')) seite('Fehlt: ZipArchive', 'PHP auf diesem Server kann keine ZIP-Dateien auspacken.');

// die Pakete laut Release, nach Namen geordnet
[$json, $fehler] = abrufen(RELEASE);
if ($json === false) seite('Release nicht gefunden', $h($fehler) . ' — Ist der Workflow «Scharfe Umgebung» durchgelaufen?');
$pakete = [];
foreach (json_decode($json, true)['assets'] ?? [] as $a) {
    if (preg_match('/^scharf-[a-z0-9]+-\d+\.zip$/', $a['name'])) $pakete[$a['name']] = $a['browser_download_url'];
}
ksort($pakete);
$namen = array_keys($pakete);
if (!$namen) seite('Keine Pakete', 'Im Release liegen noch keine Pakete.');

if ($nr >= count($namen)) {
    // die Verzeichnisse der Reihen zusammenfügen
    $alle = null;
    foreach (glob(__DIR__ . '/scharf/index-*.json') as $datei) {
        $ix = json_decode(file_get_contents($datei), true);
        if (!$ix) continue;
        if ($alle === null) { $alle = $ix; $alle['strecken'] = []; $alle['kacheln'] = []; }
        $alle['strecken'] = array_merge($alle['strecken'], $ix['strecken'] ?? []);
        $alle['kacheln'] = array_merge($alle['kacheln'], $ix['kacheln'] ?? []);
    }
    if ($alle === null) seite('Kein Verzeichnis', 'In scharf/ liegt kein index-*.json.');
    ksort($alle['kacheln']);
    file_put_contents(__DIR__ . '/scharf/index.json', json_encode($alle, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    @unlink(__FILE__);
    seite('Fertig', count($namen) . ' Pakete ausgepackt, ' . count($alle['kacheln']) . ' Kacheln im Verzeichnis. Das Skript hat sich gelöscht.');
}

$name = $namen[$nr];
$tmp = __DIR__ . '/.' . $name . '.tmp';
[$ok, $fehler] = abrufen($pakete[$name], $tmp);
if (!$ok) { @unlink($tmp); seite('Laden fehlgeschlagen', $h($name) . ': ' . $h($fehler) . ' — Seite neu laden versucht es noch einmal.'); }
$zip = new ZipArchive();
if ($zip->open($tmp) !== true) { @unlink($tmp); seite('Paket kaputt', $h($name) . ' liess sich nicht öffnen. Neu laden versucht es noch einmal.'); }
$zip->extractTo(__DIR__);
$zip->close();
@unlink($tmp);
seite('Paket ' . ($nr + 1) . ' von ' . count($namen), $h($name) . ' ist ausgepackt. Weiter in einer Sekunde …', $nr + 1);
