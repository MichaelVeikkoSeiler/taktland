<?php
/**
 * Holt die Pakete der scharfen Umgebung vom GitHub-Release «scharf-1» direkt auf daten.taktland.ch und packt sie aus
 * (Michael, 2026-10-12: «so viel Details wie möglich»), ohne Gigabytes von Hand herunter- und hochzuladen. Die Pakete
 * baut der Workflow «Scharfe Umgebung» (.github/workflows/scharf.yml).
 *
 * Einmal in public_html/daten hochladen und https://daten.taktland.ch/holen.php öffnen: je Aufruf ein Paket, die Seite
 * lädt sich selbst neu, bis alle da sind. Zuletzt fügt es die Verzeichnisse der Reihen (scharf/index-*.json) zu
 * scharf/index.json zusammen, erst dann sieht die App die neuen Kacheln, und löscht sich selbst.
 *
 * Seit 2026-10-13 dasselbe für Gebäude und Bäume je Kanton (Workflow «Gebäude und Bäume», .github/workflows/umgebung.yml,
 * Release «umgebung-1», Ordner gebaeude/ und baeume/). Welches Release, steht in HOLEN; für die scharfe Umgebung dort
 * 'scharf-1' eintragen, in NUR der Anfang der Pakete, die es holen soll.
 */
// 2026-10-19 die Details für «3D Schweiz» (Workflow «3D Schweiz Details», Release «schweiz3d-1», Ordner schweiz3d/)
// 2026-10-19 das Luftbild auf 50 cm für die Stufe 1 km (Workflow «3D Schweiz fein», Release «schweiz3dfein-1», Ordner schweiz3dfein/)
const HOLEN = 'schweiz3dfein-1';
// nur Pakete, deren Name so beginnt, leer für alle: 'scharf-r5-' holt nur die Nachträge (Reihe 5, Michael, 2026-10-15: BTI),
// 'scharf-r6' alle übrigen Bahnlinien (Reihen 6a bis 6h, Michael, 2026-10-15: «Alles scharf machen»);
// die Verzeichnisse der anderen Reihen liegen schon da und werden mit zusammengefügt;
// 2026-10-16 Gebäude und Bäume aller Kantone (umgebung-1, alle Pakete): auf dem Server fehlten sie, ab Wankdorf gab es keine
const NUR = '';
const ARTEN = ['scharf-1' => ['muster' => '/^scharf-[a-z0-9]+-\d+\.zip$/', 'ordner' => ['scharf'], 'workflow' => 'Scharfe Umgebung'],
               'umgebung-1' => ['muster' => '/^umgebung-[a-z0-9]+-\d+\.zip$/', 'ordner' => ['gebaeude', 'baeume'], 'workflow' => 'Gebäude und Bäume'],
               'schweiz3d-1' => ['muster' => '/^schweiz3d-[a-z0-9]+-\d+\.zip$/', 'ordner' => ['schweiz3d'], 'workflow' => '3D Schweiz Details'],
               'schweiz3dfein-1' => ['muster' => '/^schweiz3dfein-[a-z0-9]+-\d+\.zip$/', 'ordner' => ['schweiz3dfein'], 'workflow' => '3D Schweiz fein']];
const RELEASE = 'https://api.github.com/repos/MichaelVeikkoSeiler/taktland/releases/tags/' . HOLEN;

header('Content-Type: text/html; charset=utf-8');
set_time_limit(900);
$nr = isset($_GET['teil']) ? max(0, (int) $_GET['teil']) : 0;
$versuch = isset($_GET['versuch']) ? max(0, (int) $_GET['versuch']) : 0;
$h = fn($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');

function seite($titel, $text, $weiter = null, $versuch = 0, $warten = 1) {
    echo '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Taktland Daten</title>';
    if ($weiter !== null) echo '<meta http-equiv="refresh" content="' . (int) $warten . ';url=?teil=' . (int) $weiter . ($versuch ? '&versuch=' . (int) $versuch : '') . '">';
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
if ($json === false) seite('Release nicht gefunden', $h($fehler) . ' — Ist der Workflow «' . ARTEN[HOLEN]['workflow'] . '» durchgelaufen?');
$pakete = [];
foreach (json_decode($json, true)['assets'] ?? [] as $a) {
    if (preg_match(ARTEN[HOLEN]['muster'], $a['name']) && str_starts_with($a['name'], NUR)) $pakete[$a['name']] = [$a['browser_download_url'], (int) $a['size']];
}
ksort($pakete);
$namen = array_keys($pakete);
if (!$namen) seite('Keine Pakete', 'Im Release liegen noch keine Pakete.');

if ($nr >= count($namen)) {
    // die Verzeichnisse der Reihen oder Kantone zusammenfügen
    $zahl = 0;
    foreach (ARTEN[HOLEN]['ordner'] as $ordner) {
        $alle = null;
        foreach (glob(__DIR__ . '/' . $ordner . '/index-*.json') as $datei) {
            $ix = json_decode(file_get_contents($datei), true);
            if (!$ix) continue;
            if ($alle === null) { $alle = $ix; $alle['strecken'] = []; $alle['kantone'] = []; $alle['kacheln'] = []; }
            $alle['strecken'] = array_merge($alle['strecken'], $ix['strecken'] ?? []);
            if (isset($ix['kanton'])) $alle['kantone'][] = $ix['kanton'];
            // + statt array_merge: Namen wie 5170_2395 bleiben Schlüssel
            $alle['kacheln'] = $alle['kacheln'] + ($ix['kacheln'] ?? []);
        }
        if ($alle === null) seite('Kein Verzeichnis', 'In ' . $h($ordner) . '/ liegt kein index-*.json.');
        unset($alle['kanton']);
        ksort($alle['kacheln']);
        file_put_contents(__DIR__ . '/' . $ordner . '/index.json', json_encode($alle, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $zahl += count($alle['kacheln']);
    }
    @unlink(__DIR__ . '/.holen.sperre');
    @unlink(__FILE__);
    seite('Fertig', count($namen) . ' Pakete ausgepackt, ' . $zahl . ' Kacheln in den Verzeichnissen. Das Skript hat sich gelöscht.');
}

// nur ein Aufruf zugleich: ein zweiter (Seite doppelt offen, Neuladen während des Ladens) würde dieselbe Datei beschreiben
$sperre = fopen(__DIR__ . '/.holen.sperre', 'c');
if (!flock($sperre, LOCK_EX | LOCK_NB)) seite('Läuft schon', 'Ein anderer Aufruf lädt gerade. Diese Seite versucht es in 30 Sekunden wieder.', $nr, $versuch, 30);

// misslingt ein Paket, versucht die Seite es von selbst noch zweimal, dann wartet sie auf Neuladen
$nochmal = function ($titel, $text) use ($nr, $versuch) {
    if ($versuch < 2) seite($titel, $text . ' Neuer Versuch in 10 Sekunden …', $nr, $versuch + 1, 10);
    seite($titel, $text . ' Nach drei Versuchen: Seite neu laden versucht es noch einmal.');
};

$name = $namen[$nr];
[$url, $groesse] = $pakete[$name];
$tmp = __DIR__ . '/.' . $name . '.tmp';
[$ok, $fehler] = abrufen($url, $tmp);
clearstatcache();
$da = is_file($tmp) ? filesize($tmp) : 0;
if (!$ok) { @unlink($tmp); $nochmal('Laden fehlgeschlagen', $h($name) . ': ' . $h($fehler) . '.'); }
if ($da !== $groesse) { @unlink($tmp); $nochmal('Paket unvollständig', $h($name) . ': ' . $da . ' von ' . $groesse . ' Bytes angekommen.'); }
$zip = new ZipArchive();
if ($zip->open($tmp) !== true) { @unlink($tmp); $nochmal('Paket kaputt', $h($name) . ' liess sich nicht öffnen.'); }
if (!$zip->extractTo(__DIR__)) { $zip->close(); @unlink($tmp); $nochmal('Auspacken fehlgeschlagen', $h($name) . ' liess sich nicht ganz auspacken (Platz?).'); }
$zip->close();
@unlink($tmp);
seite('Paket ' . ($nr + 1) . ' von ' . count($namen), $h($name) . ' ist ausgepackt. Weiter in einer Sekunde …', $nr + 1);
