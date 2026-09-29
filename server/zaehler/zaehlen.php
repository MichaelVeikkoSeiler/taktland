<?php
/**
 * Zähler von Taktland (Michael, 2026-09-29): zählt nur, wie oft die Webseite
 * und die App geöffnet werden, eine Zeile pro Tag. Gespeichert werden keine
 * IP-Adresse, keine Kennung und keine Uhrzeit, nur drei Zahlen je Tag.
 *
 *   w=web  Webseite taktland.ch aufgerufen
 *   w=app  App an diesem Tag auf einem Gerät geöffnet (höchstens einmal pro Tag und Gerät)
 *   w=neu  App auf einem Gerät zum ersten Mal geöffnet (zählt auch als app)
 *
 * Liegt auf zaehler.taktland.ch (Webhosting bei cyon), nicht bei GitHub.
 */

const HERKUNFT = ['https://taktland.ch', 'https://www.taktland.ch'];
const ARTEN = ['web', 'app', 'neu'];
const DATEI = __DIR__ . '/daten/zaehler.csv';

header('Cache-Control: no-store');
$herkunft = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($herkunft, HERKUNFT, true)) {
    header('Access-Control-Allow-Origin: ' . $herkunft);
}

$art = $_GET['w'] ?? '';
// nur von taktland.ch aus und nur bekannte Arten; alles andere zählt nicht
if (!in_array($art, ARTEN, true) || !in_array($herkunft, HERKUNFT, true)) {
    http_response_code(204);
    exit;
}

date_default_timezone_set('Europe/Zurich');
$heute = date('Y-m-d');

$f = fopen(DATEI, 'c+');
if ($f === false) {
    http_response_code(204);
    exit;
}
flock($f, LOCK_EX);
// Aufbau: tag,web,app,neu
$zeilen = [];
while (($z = fgetcsv($f, 0, ',', '"', '')) !== false) {
    if (count($z) === 4 && preg_match('/^\d{4}-\d{2}-\d{2}$/', $z[0])) {
        $zeilen[$z[0]] = [(int) $z[1], (int) $z[2], (int) $z[3]];
    }
}
$zeilen[$heute] ??= [0, 0, 0];
if ($art === 'web') $zeilen[$heute][0]++;
if ($art === 'app' || $art === 'neu') $zeilen[$heute][1]++;
if ($art === 'neu') $zeilen[$heute][2]++;
ksort($zeilen);

$text = "tag,web,app,neu\n";
foreach ($zeilen as $tag => [$web, $app, $neu]) {
    $text .= "$tag,$web,$app,$neu\n";
}
ftruncate($f, 0);
rewind($f);
fwrite($f, $text);
fflush($f);
flock($f, LOCK_UN);
fclose($f);

http_response_code(204);
