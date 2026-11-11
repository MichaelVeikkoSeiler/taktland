<?php
/**
 * Echtzeit der Züge für die Virtuelle Schweiz (Michael, 2026-11-11: «Langsam könnten wir uns an die realen Zugfahrzeiten heranwagen», «ok gehen
 * wirs an»). Holt GTFS-Realtime (Trip Updates) von opentransportdata.swiss mit dem Schlüssel aus daten/echtzeit-schluessel.txt, höchstens alle
 * ABRUF_S Sekunden (die Plattform erlaubt zwei Abfragen je Minute und erneuert die Daten alle 30 s), liest das Protobuf und legt es verkürzt in
 * daten/ ab, verteilt auf TEILE Dateien nach der trip_id. Die Geräte fragen nur hier, nie mit dem Schlüssel.
 *
 *   GET  echtzeit.php?a=test            -> {"ok":true,"schluessel":true}
 *   POST echtzeit.php?a=fahrten         Körper: {"t":["trip_id", …]}  (höchstens HOECHSTENS_FAHRTEN)
 *        -> {"v":"20261021","zeit":1762870000,"alter":12,"f":{"trip_id":[["20261111",3,[[seq,an,ab,art],…]],…]}}
 *
 * je Fahrt und Verkehrstag (start_date): Art der Fahrt (0 planmässig, 3 fällt aus, 7 gelöscht, sonst wie GTFS-RT) und je Halt mit Meldung
 * stop_sequence, Verspätung bei der Ankunft und Abfahrt in Sekunden (null ohne Angabe) und Art des Halts (0 planmässig, 1 fällt aus, 2 ohne Daten).
 * Ohne IP-Adresse und ohne Konto; was die Geräte fragen, wird nicht gespeichert.
 *
 * Liegt auf spiel.taktland.ch (Webhosting bei cyon) neben raum.php, nicht bei GitHub. Der Schlüssel kommt von Hand nach
 * daten/echtzeit-schluessel.txt (der Ordner ist gesperrt), nie ins Repository.
 */

const HERKUNFT = ['https://taktland.ch', 'https://www.taktland.ch', 'https://3dland.ch', 'https://www.3dland.ch'];
const ORDNER = __DIR__ . '/daten';
const QUELLE = 'https://api.opentransportdata.swiss/la/gtfs-rt';
const ABRUF_S = 35;
const TEILE = 32;
const HOECHSTENS_FAHRTEN = 3000;

header('Cache-Control: no-store');
header('Content-Type: application/json; charset=utf-8');
$herkunft = $_SERVER['HTTP_ORIGIN'] ?? '';
// zum Ausprobieren auf dem eigenen Rechner: php -S mit SPIEL_HERKUNFT=http://localhost:4180
$erlaubt = array_merge(HERKUNFT, array_filter([getenv('SPIEL_HERKUNFT') ?: '']));
if (in_array($herkunft, $erlaubt, true)) {
    header('Access-Control-Allow-Origin: ' . $herkunft);
}

function antwort($daten, $code = 200) {
    http_response_code($code);
    echo json_encode($daten, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function schluessel() {
    $d = ORDNER . '/echtzeit-schluessel.txt';
    return is_file($d) ? trim(file_get_contents($d)) : '';
}

$a = $_GET['a'] ?? '';
if ($a === 'test') antwort(['ok' => true, 'schluessel' => schluessel() !== '']);
if (!in_array($herkunft, $erlaubt, true)) antwort(['fehler' => 'herkunft'], 403);
if ($a !== 'fahrten') antwort(['fehler' => 'aktion'], 400);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') antwort(['fehler' => 'methode'], 405);

// ---- Protobuf lesen, nur was GTFS-RT dafür braucht (gtfs-realtime.proto) ----

/** liest eine Zahl (varint) ab $p, rückt $p vor */
function varint($b, &$p) {
    $v = 0; $s = 0;
    while (true) {
        $c = ord($b[$p++]);
        $v |= ($c & 0x7f) << $s;
        if ($c < 0x80) return $v;
        $s += 7;
    }
}

/** die Felder einer Nachricht: [Feldnummer, Wert] mit Zahl oder Byte-Folge */
function felder($b) {
    $p = 0; $n = strlen($b); $f = [];
    while ($p < $n) {
        $k = varint($b, $p); $nr = $k >> 3; $typ = $k & 7;
        if ($typ === 0) $f[] = [$nr, varint($b, $p)];
        elseif ($typ === 2) { $l = varint($b, $p); $f[] = [$nr, substr($b, $p, $l)]; $p += $l; }
        elseif ($typ === 1) $p += 8;
        elseif ($typ === 5) $p += 4;
        else break;
    }
    return $f;
}

/** int32 aus einer Zahl, die als 64 Bit kam (negative Verspätungen) */
function int32($v) {
    $v &= 0xffffffff;
    return $v >= 0x80000000 ? $v - 0x100000000 : $v;
}

/** StopTimeEvent: delay (1) in Sekunden, sonst null */
function verspaetung($b) {
    foreach (felder($b) as [$nr, $v]) if ($nr === 1) return int32($v);
    return null;
}

/** liest den ganzen Feed: [feed_version, Zeit, [trip_id => [JSON von [start_date, Art, Halte], …]]] */
function feedLesen($b) {
    $version = ''; $zeit = 0; $fahrten = [];
    // die oberste Ebene Stück für Stück, damit der Feed nicht zweimal im Speicher liegt
    $p = 0; $n = strlen($b);
    while ($p < $n) {
        $schl = varint($b, $p); $nr = $schl >> 3; $typ = $schl & 7;
        if ($typ === 0) { varint($b, $p); continue; }
        if ($typ === 1) { $p += 8; continue; }
        if ($typ === 5) { $p += 4; continue; }
        if ($typ !== 2) break;
        $l = varint($b, $p); $v = substr($b, $p, $l); $p += $l;
        if ($nr === 1) {
            foreach (felder($v) as [$k, $w]) {
                if ($k === 3) $zeit = $w;
                elseif ($k === 4) $version = $w;
            }
            continue;
        }
        if ($nr !== 2) continue;
        foreach (felder($v) as [$k, $w]) {
            if ($k !== 3) continue;   // nur trip_update
            $tid = ''; $datum = ''; $art = 0; $halte = [];
            foreach (felder($w) as [$t, $x]) {
                if ($t === 1) {
                    foreach (felder($x) as [$u, $y]) {
                        if ($u === 1) $tid = $y;
                        elseif ($u === 3) $datum = $y;
                        elseif ($u === 4) $art = $y;
                    }
                } elseif ($t === 2) {
                    $seq = null; $an = null; $ab = null; $hart = 0;
                    foreach (felder($x) as [$u, $y]) {
                        if ($u === 1) $seq = $y;
                        elseif ($u === 2) $an = verspaetung($y);
                        elseif ($u === 3) $ab = verspaetung($y);
                        elseif ($u === 5) $hart = $y;
                    }
                    if ($seq !== null) $halte[] = [$seq, $an, $ab, $hart];
                }
            }
            // gleich als Text: so bleibt der Speicher klein (Tausende Fahrten mit je Dutzenden Halten)
            if ($tid !== '') $fahrten[$tid][] = json_encode([$datum, $art, $halte]);
        }
    }
    return [$version, $zeit, $fahrten];
}

function teil($tid) {
    return crc32($tid) % TEILE;
}

// ---- holen, wenn der Vorrat älter als ABRUF_S ist; nur ein Aufruf zugleich, die anderen nehmen den alten ----

$meta = ORDNER . '/rt-meta.json';
$stand = is_file($meta) ? json_decode(file_get_contents($meta), true) : null;
$geholt = $stand['geholt'] ?? 0;
if (time() - $geholt >= ABRUF_S && schluessel() !== '') {
    $sperre = fopen(ORDNER . '/rt-sperre', 'c');
    if ($sperre && flock($sperre, LOCK_EX | LOCK_NB)) {
        // zuerst den Zeitpunkt setzen, damit auch ein Fehler die Plattform nicht öfter fragt
        $stand = ['geholt' => time(), 'v' => $stand['v'] ?? '', 'zeit' => $stand['zeit'] ?? 0, 'fehler' => null];
        file_put_contents($meta, json_encode($stand));
        // zum Ausprobieren: ECHTZEIT_QUELLE statt der Plattform
        $c = curl_init(getenv('ECHTZEIT_QUELLE') ?: QUELLE);
        curl_setopt_array($c, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_ENCODING => '',
            CURLOPT_TIMEOUT => 25, CURLOPT_USERAGENT => 'taktland-echtzeit',
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . schluessel()],
        ]);
        $roh = curl_exec($c);
        $code = curl_getinfo($c, CURLINFO_HTTP_CODE);
        curl_close($c);
        if ($roh !== false && $code === 200 && strlen($roh) > 0) {
            ini_set('memory_limit', '256M');
            [$version, $zeit, $fahrten] = feedLesen($roh);
            $teile = array_fill(0, TEILE, []);
            foreach ($fahrten as $tid => $l) $teile[teil($tid)][] = json_encode((string) $tid, JSON_UNESCAPED_SLASHES) . ':[' . implode(',', $l) . ']';
            foreach ($teile as $i => $t) {
                file_put_contents(ORDNER . "/rt-$i.json.neu", '{' . implode(',', $t) . '}');
                rename(ORDNER . "/rt-$i.json.neu", ORDNER . "/rt-$i.json");
            }
            $stand = ['geholt' => $stand['geholt'], 'v' => $version, 'zeit' => $zeit, 'fehler' => null, 'fahrten' => count($fahrten)];
        } else {
            $stand['fehler'] = $code ?: 'netz';
        }
        file_put_contents($meta, json_encode($stand));
        flock($sperre, LOCK_UN);
    }
}
if (!$stand || !($stand['zeit'] ?? 0)) antwort(['fehler' => schluessel() === '' ? 'kein schluessel' : 'keine daten'], 503);

// ---- die gefragten Fahrten ----

$k = json_decode(file_get_contents('php://input'), true);
$gefragt = is_array($k['t'] ?? null) ? array_slice(array_filter($k['t'], 'is_string'), 0, HOECHSTENS_FAHRTEN) : [];
$je = [];
foreach ($gefragt as $tid) $je[teil($tid)][] = $tid;
$f = [];
foreach ($je as $i => $tids) {
    $d = ORDNER . "/rt-$i.json";
    if (!is_file($d)) continue;
    $t = json_decode(file_get_contents($d), true);
    foreach ($tids as $tid) if (isset($t[$tid])) $f[$tid] = $t[$tid];
}
antwort(['v' => $stand['v'], 'zeit' => $stand['zeit'], 'alter' => time() - $stand['zeit'], 'f' => (object) $f]);
