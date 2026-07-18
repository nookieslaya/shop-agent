# Stabilne prowadzenie rozmowy

Router nie wysyła historii rozmowy do OpenAI. Każda odpowiedź zwraca mały, jawny stan zawierający wyłącznie kryteria produktowe, bieżącą intencję i identyfikatory tematów wiedzy.

## Kolejność decyzji

1. Strukturalna akcja produktu lub wybór przycisku.
2. Jawne kryteria, sortowanie albo cena produktu.
3. Prośba o kontakt z klientem.
4. Temat wykryty przez aliasy bazy wiedzy.
5. Słownictwo produktowe sklepu.
6. Skonfigurowane pytanie uzupełniające korzystające z poprzedniego tematu.
7. Intencja nierozpoznana bez dziedziczenia stanu.

Zmiana na wiedzę, kontakt lub intencję nierozpoznaną usuwa kryteria produktowe. Dalsze wyszukiwanie po porównaniu może odziedziczyć filtry. Frazy `restartProductTerms` zawsze rozpoczynają dobór od pustego zestawu filtrów.

## Konfiguracja sklepu

- `productTerms` — słowa rozpoczynające lub doprecyzowujące dobór produktu,
- `contactTerms` — prośby o kontakt z klientem,
- `continuationTerms` — początki krótkich pytań korzystających z bieżącego tematu,
- `restartProductTerms` — frazy zerujące wcześniejszy dobór.

Wszystkie listy są ustawiane osobno dla sklepu w panelu. Silnik nie zawiera nazw branż ani produktów.

## Diagnostyka

Pole `meta` odpowiedzi zawiera:

- `conversationIntent`,
- `routingReason`,
- `contextReused`,
- `contextReset`.

Dane trafiają do szczegółów historii rozmowy i pozwalają odróżnić błędną konfigurację słownictwa od błędu wyszukiwarki lub generatora odpowiedzi.
