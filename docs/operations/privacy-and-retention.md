# Prywatność i retencja rozmów

## Zasady

- Polityka jest konfigurowana osobno dla każdego sklepu.
- Domyślna retencja wynosi 90 dni; dozwolony zakres to 1–730 dni.
- Wyłączenie historii zatrzymuje nowe zapisy, ale nie usuwa automatycznie istniejących rozmów.
- E-maile i telefony są maskowane przed zapisem w treści oraz zagnieżdżonych detalach JSON.
- Historia diagnostyczna nie jest automatycznie wysyłana do OpenAI.
- Usunięcie rozmowy jest kaskadowe i obejmuje wszystkie jej wiadomości.

## Konfiguracja

W panelu przejdź do **Prywatność** i ustaw:

1. zapisywanie historii,
2. liczbę dni retencji,
3. dostępność eksportu dla administratora,
4. publiczny adres polityki prywatności sklepu.

Użyj głównego przycisku **Zapisz zmiany**. Adres polityki prywatności jest wymagany przed publikacją widgetu i jest wyświetlany klientowi w jego stopce.

## Automatyczne czyszczenie

Worker co godzinę porównuje `last_message_at` z polityką sklepu. Usuwa całe rozmowy po terminie wraz z wiadomościami i zapisuje zbiorcze zdarzenie `conversation.retention_purge` w rejestrze audytowym.

Przycisk **Uruchom czyszczenie** wykonuje tę samą operację natychmiast. Nie usuwa rozmów, które nie przekroczyły okresu retencji.

## Eksport i usunięcie

Eksport JSON zawiera identyfikator sklepu, czas eksportu, rozmowy, wiadomości i zapisane detale diagnostyczne. Dane kontaktowe pozostają zamaskowane. Każdy eksport tworzy zdarzenie `conversation.export`.

Usunięcie pojedynczej rozmowy jest dostępne przy jej wpisie w historii. Usunięcie całej historii znajduje się w strefie operacji nieodwracalnych. Obie operacje wymagają drugiego kliknięcia i są zapisywane w audycie.

Przed masowym usunięciem upewnij się, że aktualna kopia bazy została zweryfikowana. Przywrócenie z backupu odtwarza jednak całą bazę, a nie pojedynczą rozmowę, dlatego nie jest zwykłym mechanizmem cofania żądań usunięcia.

## Rejestr administratora

Tabela `admin_audit_events` przechowuje aktora, sklep, operację, cel, bezpieczne metadane i czas. Rejestr nie jest usuwany razem z rozmową, dzięki czemu pozostaje dowód wykonania operacji bez przechowywania treści klienta.
