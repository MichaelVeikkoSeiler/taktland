<?php
/**
 * Vermittlung für «Geo» auf mehreren Geräten (Michael, 2026-10-05): reicht die Ereignisse eines
 * Spielraums weiter (Beitritt, Start, Tipp, Weiter). Gerechnet wird auf den Geräten; hier liegt je
 * Raum nur eine Liste von Ereignissen mit Spielernamen und Tipps, ohne IP-Adresse und ohne Konto.
 * Räume verfallen nach VERFALL_S Sekunden und werden dann gelöscht.
 *
 *   GET  raum.php?a=test                      -> {"ok":true}
 *   POST raum.php?a=neu                       -> {"raum":"KXRT"}
 *   POST raum.php?a=senden&raum=KXRT          Körper: {"von":"…","typ":"…","d":{…}} -> {"n":5}
 *   GET  raum.php?a=holen&raum=KXRT&ab=3      -> {"ereignisse":[…],"n":5}
 *
 * Liegt auf spiel.taktland.ch (Webhosting bei cyon), nicht bei GitHub.
 */

const HERKUNFT = ['https://taktland.ch', 'https://www.taktland.ch'];
const ORDNER = __DIR__ . '/daten';
const ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // ohne I und O, damit niemand sie mit 1 und 0 verwechselt
const VERFALL_S = 6 * 3600;
const HOECHSTENS_RAEUME = 300;
const HOECHSTENS_EREIGNISSE = 600;
const HOECHSTENS_BYTE = 16000;

header('Cache-Control: no-store');
header('Content-Type: application/json; charset=utf-8');
$herkunft = $_SERVER['HTTP_ORIGIN'] ?? '';
// zum Ausprobieren auf dem eigenen Rechner: php -S mit SPIEL_HERKUNFT=http://localhost:4173
$erlaubt = array_merge(HERKUNFT, array_filter([getenv('SPIEL_HERKUNFT') ?: '']));
if (in_array($herkunft, $erlaubt, true)) {
    header('Access-Control-Allow-Origin: ' . $herkunft);
}

function antwort($daten, $code = 200) {
    http_response_code($code);
    echo json_encode($daten, JSON_UNESCAPED_UNICODE);
    exit;
}

function pfad($raum) {
    return ORDNER . '/r-' . $raum . '.json';
}

$a = $_GET['a'] ?? '';
if ($a === 'test') antwort(['ok' => true]);
if (!in_array($herkunft, $erlaubt, true)) antwort(['fehler' => 'herkunft'], 403);

if ($a === 'neu') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') antwort(['fehler' => 'methode'], 405);
    // verfallene Räume löschen
    $raeume = glob(ORDNER . '/r-*.json') ?: [];
    foreach ($raeume as $f) {
        if (filemtime($f) < time() - VERFALL_S) @unlink($f);
    }
    if (count(glob(ORDNER . '/r-*.json') ?: []) >= HOECHSTENS_RAEUME) antwort(['fehler' => 'voll'], 503);
    for ($versuch = 0; $versuch < 20; $versuch++) {
        $raum = '';
        for ($i = 0; $i < 4; $i++) $raum .= ZEICHEN[random_int(0, strlen(ZEICHEN) - 1)];
        $f = @fopen(pfad($raum), 'x');   // x: nur, wenn es den Raum noch nicht gibt
        if ($f !== false) {
            fwrite($f, '[]');
            fclose($f);
            antwort(['raum' => $raum]);
        }
    }
    antwort(['fehler' => 'kein freier Code'], 503);
}

$raum = $_GET['raum'] ?? '';
if (!preg_match('/^[' . ZEICHEN . ']{4}$/', $raum) || !is_file(pfad($raum))) antwort(['fehler' => 'raum'], 404);

if ($a === 'holen') {
    $ab = max(0, (int)($_GET['ab'] ?? 0));
    $liste = json_decode((string)@file_get_contents(pfad($raum)), true) ?: [];
    antwort(['ereignisse' => array_slice($liste, $ab), 'n' => count($liste)]);
}

if ($a === 'senden') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') antwort(['fehler' => 'methode'], 405);
    $roh = file_get_contents('php://input', false, null, 0, HOECHSTENS_BYTE + 1);
    if ($roh === false || strlen($roh) > HOECHSTENS_BYTE) antwort(['fehler' => 'zu gross'], 413);
    $e = json_decode($roh, true);
    if (!is_array($e) || !is_string($e['von'] ?? null) || !is_string($e['typ'] ?? null)
        || strlen($e['von']) > 40 || strlen($e['typ']) > 20) antwort(['fehler' => 'form'], 400);
    $neu = ['von' => $e['von'], 'typ' => $e['typ'], 'd' => $e['d'] ?? null];
    $f = fopen(pfad($raum), 'c+');
    if ($f === false) antwort(['fehler' => 'speicher'], 500);
    flock($f, LOCK_EX);
    $liste = json_decode(stream_get_contents($f), true) ?: [];
    if (count($liste) >= HOECHSTENS_EREIGNISSE) { flock($f, LOCK_UN); fclose($f); antwort(['fehler' => 'voll'], 409); }
    $liste[] = $neu;
    ftruncate($f, 0);
    rewind($f);
    fwrite($f, json_encode($liste, JSON_UNESCAPED_UNICODE));
    fflush($f);
    flock($f, LOCK_UN);
    fclose($f);
    antwort(['n' => count($liste)]);
}

antwort(['fehler' => 'aktion'], 400);
