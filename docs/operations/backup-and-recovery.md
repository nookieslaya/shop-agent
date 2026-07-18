# Kopie zapasowe i odtwarzanie PostgreSQL

## Założenia operacyjne

- domyślny RPO: do 24 godzin (`BACKUP_INTERVAL_HOURS`),
- domyślna retencja: 14 dni (`BACKUP_RETENTION_DAYS`),
- format: skompresowane archiwum `pg_dump` custom format,
- integralność: lista `pg_restore`, SHA-256 i manifest JSON,
- miejsce: wolumen Docker `shop_agent_backups`, oddzielony od danych PostgreSQL.

Kontener `backup` tworzy pierwszą kopię od razu po starcie, a kolejne według interwału. Plik tymczasowy zostaje przeniesiony pod nazwę końcową dopiero po poprawnym zakończeniu dumpu i walidacji.

Skrypty są kopiowane do osobnego obrazu `Dockerfile.backup`. Podczas budowania obrazu zakończenia linii są normalizowane do LF, dlatego działanie nie zależy od ustawień `core.autocrlf` na Windows.

## Kontrola stanu

W PowerShell uruchom:

```powershell
docker compose ps backup
docker compose logs backup --tail=100
docker compose run --rm backup sh -c "ls -lh /backups"
```

Stan jest też dostępny w panelu właściciela w sekcji **Kopie zapasowe**. Brak aktualnej i zweryfikowanej kopii blokuje pierwszą publikację widgetu.

## Kopia na żądanie

```powershell
docker compose run --rm backup sh /scripts/backup-once.sh
docker compose run --rm backup sh -c "ls -lh /backups"
```

Zapisz dokładną nazwę pliku kończącego się na `.dump`.

## Próbne odtworzenie

Poniższa operacja nie zmienia bazy aplikacji. Tworzy osobną bazę tymczasową, odtwarza archiwum, sprawdza tabelę sklepów i zawsze usuwa bazę testową.

```powershell
docker compose run --rm backup sh /scripts/verify-backup.sh shop_agent_YYYYMMDDTHHMMSSZ.dump
```

Zastąp nazwę przykładową dokładną nazwą z poprzedniego polecenia. Sukces kończy się komunikatem `Backup verified successfully` i aktualizuje status w panelu.

## Pełne odtworzenie po awarii

Ta procedura zastępuje całą bazę aplikacji. Wykonuj ją wyłącznie po potwierdzonej awarii oraz po wcześniejszej weryfikacji wybranego archiwum.

```powershell
docker compose stop api worker backup
docker compose run --rm backup sh /scripts/verify-backup.sh shop_agent_YYYYMMDDTHHMMSSZ.dump
docker compose run --rm backup sh /scripts/restore-backup.sh shop_agent_YYYYMMDDTHHMMSSZ.dump RESTORE-shop_agent
docker compose up -d api worker backup
Invoke-RestMethod http://localhost:3000/ready
```

Skrypt odrzuca ścieżki, pliki bez rozszerzenia `.dump`, błędną sumę kontrolną i każde potwierdzenie inne niż dokładne `RESTORE-shop_agent`. API, worker i automatyczny backup muszą być zatrzymane, aby podczas odtwarzania nikt nie zapisywał danych.

Po odtworzeniu sprawdź panel, ostatnie rozmowy, liczbę produktów i kolejkę synchronizacji. Nie uruchamiaj pełnej synchronizacji, dopóki nie potwierdzisz, że odtworzone dane są spójne.

## Ograniczenie lokalnego wolumenu

Wolumen `shop_agent_backups` chroni przed uszkodzeniem bazy lub błędem aplikacji, ale znajduje się na tym samym serwerze. Nie chroni przed utratą VPS, dysku ani konta hostingowego. Przed publicznym wdrożeniem kopie muszą być szyfrowane i replikowane do drugiej lokalizacji z osobnymi poświadczeniami. Konkretny mechanizm dobierzemy po wyborze docelowego serwera, bez wiązania silnika sklepowego z jednym dostawcą hostingu.
