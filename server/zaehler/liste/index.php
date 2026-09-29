<?php
/**
 * Die Zahlen des Zählers als Tabelle, neueste zuerst. Der Ordner «liste» ist
 * bei cyon mit einem Passwort geschützt (Sicherheit → Verzeichnisschutz).
 * ?csv lädt die Rohdaten herunter.
 */
$datei = __DIR__ . '/../daten/zaehler.csv';
$text = is_file($datei) ? file_get_contents($datei) : "tag,web,app,neu\n";

if (isset($_GET['csv'])) {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="taktland-zaehler.csv"');
    echo $text;
    exit;
}

$zeilen = [];
foreach (array_slice(explode("\n", trim($text)), 1) as $z) {
    $t = explode(',', $z);
    if (count($t) === 4) $zeilen[] = $t;
}
$zeilen = array_reverse($zeilen);
$h = fn($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
?><!doctype html>
<html lang="de-CH">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Zähler Taktland</title>
<style>
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; margin: 24px 16px; color: #212121; }
  h1 { font-size: 24px; margin: 0 0 8px; }
  p { color: #767676; margin: 0 0 16px; max-width: 40em; }
  table { border-collapse: collapse; }
  th, td { padding: 6px 14px; text-align: right; border-bottom: 1px solid #e5e5e5; font-variant-numeric: tabular-nums; }
  th:first-child, td:first-child { text-align: left; }
  th { font-weight: 600; }
</style>
</head>
<body>
<h1>Zähler Taktland</h1>
<p>web: Aufrufe der Webseite. app: Geräte, die die App an diesem Tag geöffnet haben.
   neu: davon zum ersten Mal. Ohne Netz, mit Werbeblocker oder hinter manchem Firmenfilter
   zählt nichts; die Zahlen sind eine Untergrenze.</p>
<?php if (!$zeilen): ?>
<p>Noch keine Zahlen.</p>
<?php else: ?>
<table>
  <tr><th>Tag</th><th>web</th><th>app</th><th>neu</th></tr>
  <?php foreach ($zeilen as [$tag, $web, $app, $neu]): ?>
  <tr><td><?= $h($tag) ?></td><td><?= $h($web) ?></td><td><?= $h($app) ?></td><td><?= $h($neu) ?></td></tr>
  <?php endforeach; ?>
</table>
<?php endif; ?>
<p style="margin-top:16px"><a href="?csv">Als CSV herunterladen</a></p>
</body>
</html>
