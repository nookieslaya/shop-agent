# Konta administratorów

## Pierwszy właściciel

Po uruchomieniu migracji ustaw hasło tylko w bieżącej sesji PowerShell:

```powershell
$env:ADMIN_NEW_PASSWORD = Read-Host "Nowe hasło właściciela"
docker compose run --rm -e ADMIN_NEW_PASSWORD=$env:ADMIN_NEW_PASSWORD app npm run admin:user -- --action=create --username=admin --role=owner
Remove-Item Env:ADMIN_NEW_PASSWORD
```

Hasło musi mieć co najmniej 12 znaków. Nie podawaj go jako `--password`, ponieważ zostałoby zapisane w historii terminala i mogłoby być widoczne na liście procesów.

Po zalogowaniu kontem `admin` przejdź do sekcji **Administratorzy**. Gdy potwierdzisz poprawne działanie, usuń `ADMIN_PASSWORD` z produkcyjnego środowiska. Nagłówek API oparty o ten sekret pozostaje tylko mechanizmem migracyjnym dla kontrolowanych automatyzacji.

## Role

- `owner` — pełny dostęp oraz zarządzanie kontami,
- `operator` — odczyt i operacje związane ze sklepami, bez zarządzania kontami,
- `viewer` — wyłącznie odczyt endpointów administracyjnych.

Każda osoba powinna otrzymać własne konto. Nie udostępniaj wspólnego konta między pracownikami.

## Odzyskanie dostępu

Najpierw wyświetl identyfikatory:

```powershell
docker compose run --rm app npm run admin:user -- --action=list
```

Następnie ustaw nowe hasło:

```powershell
$env:ADMIN_NEW_PASSWORD = Read-Host "Nowe hasło"
docker compose run --rm -e ADMIN_NEW_PASSWORD=$env:ADMIN_NEW_PASSWORD app npm run admin:user -- --action=reset-password --id=UUID_UZYTKOWNIKA
Remove-Item Env:ADMIN_NEW_PASSWORD
```

Reset hasła natychmiast usuwa wszystkie sesje tego użytkownika. Sesje można również unieważnić bez zmiany hasła:

```powershell
docker compose run --rm app npm run admin:user -- --action=revoke-sessions --id=UUID_UZYTKOWNIKA
```

## Zabezpieczenia

- scrypt z unikalną solą dla każdego hasła,
- losowy token sesji; w bazie przechowywany jest wyłącznie jego SHA-256,
- ciasteczko `HttpOnly`, `SameSite=Strict`, a w produkcji także `Secure`,
- siedmiodniowy termin sesji i możliwość natychmiastowego odwołania,
- blokada na 15 minut po pięciu błędnych próbach,
- role egzekwowane przed obsługą endpointu,
- logowania i operacje na kontach zapisane w audycie.
