# Food Scanner — Skaner produktu spożywczego (Expo / React Native)

Miniaplikacja  ćwiczenie **4.7** 

## 1. Cel aplikacji

Aplikacja pozwala zeskanować kod kreskowy produktu spożywczego aparatem
telefonu, a następnie pobiera i wyświetla podstawowe informacje o produkcie
nazwa, marka, kategoria z publicznej bazy **Open Food Facts**.

## 2. Wykorzystane dane z urządzenia

- **Aparat (kamera) — podgląd obrazu i automatyczne wykrywanie kodów
  kreskowych (EAN-13, EAN-8, UPC-A, UPC-E, Code128, Code39) za pomocą
  `expo-camera

 
 ## 3. Wykorzystane biblioteki i API

 `expo-camera`  dostęp do aparatu i wbudowany skaner kodów kreskowych 
 `expo-sqlite`  lokalny zapis historii ostatnio wyszukanych produktów 
 **Open Food Facts API** (`GET /api/v2/product/{barcode}.json`)  pobranie danych o produkcie na podstawie kodu kreskowego 

Dokumentacja API: https://openfoodfacts.github.io/openfoodfacts-server/api/

## 4. Przepływ danych w aplikacji

1. Po uruchomieniu aplikacja prosi o zgodę na dostęp do aparatu
   (`useCameraPermissions`).
2. Po udzieleniu zgody uruchamiany jest podgląd kamery .
3. Gdy w kadrze pojawi się kod kreskowy, wywoływany jest callback
   `onBarcodeScanned` ustawiana jest flaga `scanned`, aby zablokować
    wielokrotny odczyt tego samego kodu.
4. Aplikacja wysyła zapytanie `GET` do Open Food Facts z odczytanym kodem.
5. Odpowiedź JSON jest sprawdzana (`response.ok`, `data.status`):
   - jeśli produkt istnieje  dane są mapowane i wyświetlane w karcie wyniku
     oraz zapisywane do lokalnej historii ,
   - jeśli produkt nie istnieje w bazie  wyświetlany jest czytelny komunikat,
   - w razie błędu sieci  wyświetlany jest komunikat o błędzie połączenia.
6. Użytkownik może nacisnąć „Skanuj ponownie", aby wrócić do podglądu kamery,
   lub otworzyć zakładkę „Historia" z listą ostatnich skanów .

## 5. Obsługa stanów aplikacji

Zaimplementowane stany zgodnie z wymaganiami modułu:

- **ładowanie** — `ActivityIndicator` podczas zapytania do API,
- **sukces** — karta z danymi produktu,
- **błąd** — komunikat o błędzie sieci lub błędzie HTTP,
- **brak danych** — komunikat „produkt nie istnieje w bazie",
- **brak zgody użytkownika** — ekran z prośbą o uprawnienia do aparatu.

## 6. Ograniczenia i napotkane problemy

- Baza Open Food Facts jest współtworzona przez społeczność  część
  produktów (szczególnie lokalnych, spoza rynków UE/USA) może mieć
  niepełne dane lub nie występować w bazie wcale.
- Nutri-Score nie jest dostępny dla wszystkich produktów ( brak pełnej
  listy składników)
- Skaner wymaga fizycznego urządzenia z aparatem; w symulatorze
  bez kamery funkcja skanowania nie zadziała poprawnie.
- Aplikacja nie waliduje jakości/ostrości obrazu  bardzo słabe
  oświetlenie może utrudnić odczyt kodu.

## 7. Uruchomienie projektu

```bash
npm install
npx expo install --fix
npx expo start -c --tunnel
```

**Uwaga:** projekt wymaga uruchomienia w trybie `--tunnel`. W trybie
standardowym (LAN) `expo-sqlite` w połączeniu z Expo Go potrafi zgłaszać
błąd połączenia przy pierwszym ładowaniu bundla na niektórych sieciach 
tryb tunnel omija ten problem

Przy pierwszym użyciu `--tunnel` Expo poprosi o instalację pakietu
`@expo/ngrok` — potwierdź (`y`). Jeśli instalacja globalna się nie powiedzie,
zainstaluj go lokalnie w projekcie:

npm install --save-dev @expo/ngrok@^4.1.0


Po uruchomieniu zeskanuj kod QR aplikacją **Expo Go** na telefonie
(zalecane urządzenie fizyczne ze względu na wykorzystanie aparatu).
Upewnij się, że wersja SDK w Expo Go zgadza się z wersją `expo` w
`package.json` projektu (Profil w Expo Go pokazuje obsługiwany SDK).

