# Stabilne prowadzenie rozmowy

Router nie wysyła historii rozmowy do OpenAI. Każda odpowiedź zwraca mały, jawny stan zawierający wyłącznie kryteria produktowe, bieżącą intencję i identyfikatory tematów wiedzy.

Stan może również przechować ostatnie kryteria produktowe oraz minimalną i maksymalną cenę pokazanych wyników. Dzięki temu zwrot „pokaż droższe niż te” jest zamieniany na konkretny próg cenowy nawet po krótkiej zmianie tematu. Nie są przechowywane treści wiadomości ani odpowiedzi.

## Kolejność decyzji

1. Strukturalna akcja produktu lub wybór przycisku.
2. Jawne kryteria, sortowanie albo cena produktu.
3. Prośba o kontakt z klientem.
4. Temat wykryty przez aliasy bazy wiedzy.
5. Słownictwo produktowe sklepu.
6. Skonfigurowane pytanie uzupełniające korzystające z poprzedniego tematu.
7. Intencja nierozpoznana bez dziedziczenia stanu.

Zmiana na wiedzę, kontakt lub intencję nierozpoznaną usuwa kryteria produktowe. Dalsze wyszukiwanie po porównaniu może odziedziczyć filtry. Frazy `restartProductTerms` zawsze rozpoczynają dobór od pustego zestawu filtrów.

Wybór budżetu bez limitu zwraca przekrój dopasowanych produktów od niższej do najwyższej półki cenowej. Jawne żądania „najtańsze” i „najdroższe” nadal używają ścisłego sortowania, a kwoty typu „około 4000 zł” są porządkowane według odległości od ceny docelowej.

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
