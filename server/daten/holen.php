<?php
/**
 * Holt die Pakete der scharfen Umgebung von einem GitHub-Release direkt auf daten.taktland.ch und packt sie aus
 * (Michael, 2026-10-12: «so viel Details wie möglich», ohne alles von Hand hoch- und herunterzuladen).
 *
 * Einmal in public_html/daten hochladen und https://daten.taktland.ch/holen.php öffnen: je Aufruf ein Paket, die Seite
 * lädt sich selbst neu, bis alle da sind; index.json kommt zuletzt, erst dann sieht die App die neuen Kacheln.
 * Am Schluss löscht sich das Skript selbst.
 */
const QUELLE = 'https://github.com/MichaelVeikkoSeiler/taktland/releases/download/scharf-1/';
const PAKETE = ['scharf-teil-01.zip'];   // wird beim Bau der Pakete ersetzt (pipeline/scharf_pakete.py)

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

if (!class_exists('ZipArchive')) seite('Fehlt: ZipArchive', 'PHP auf diesem Server kann keine ZIP-Dateien auspacken.');
if ($nr >= count(PAKETE)) {
    @unlink(__FILE__);
    seite('Fertig', count(PAKETE) . ' Pakete ausgepackt. Das Skript hat sich gelöscht.');
}

$name = PAKETE[$nr];
$tmp = __DIR__ . '/.' . $name . '.tmp';
$fp = fopen($tmp, 'w');
$ch = curl_init(QUELLE . $name);
curl_setopt_array($ch, [CURLOPT_FILE => $fp, CURLOPT_FOLLOWLOCATION => true, CURLOPT_FAILONERROR => true,
    CURLOPT_CONNECTTIMEOUT => 30, CURLOPT_TIMEOUT => 800]);
$ok = curl_exec($ch);
$fehler = curl_error($ch);
curl_close($ch);
fclose($fp);
if (!$ok) { @unlink($tmp); seite('Laden fehlgeschlagen', $h($name) . ': ' . $h($fehler) . ' — Seite neu laden versucht es noch einmal.'); }

$zip = new ZipArchive();
if ($zip->open($tmp) !== true) { @unlink($tmp); seite('Paket kaputt', $h($name) . ' liess sich nicht öffnen. Neu laden versucht es noch einmal.'); }
$zip->extractTo(__DIR__);
$zip->close();
@unlink($tmp);
seite('Paket ' . ($nr + 1) . ' von ' . count(PAKETE), $h($name) . ' ist ausgepackt. Weiter in einer Sekunde …', $nr + 1);
