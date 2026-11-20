# Underlag för Chrome Web Store

## Namn
Provtidsbevakning för Trafikverket

## Kort beskrivning (max 132 tecken)
Får ett larm när en ledig tid för förarprov dyker upp i Trafikverkets bokning. Bokar inget åt dig, du bokar själv.

## Detaljerad beskrivning
Avbokade provtider hos Trafikverket försvinner ofta inom några minuter. Provtidsbevakning
håller koll på bokningen medan du gör annat och säger till när en tid dyker upp inom de datum
du har valt.

Så fungerar det
1. Logga in med BankID på Trafikverkets bokningssida och välj prov som vanligt.
2. Skapa en bevakning i rutan nere till höger genom att välja ett datumintervall.
3. Sök på de orter du vill bevaka, så läggs de till i bevakningen.
4. Låt fliken vara öppen. Tiderna kontrolleras ungefär en gång i minuten.

När en tid dyker upp får du ljud och en notis i datorn, och om du vill även en pushnotis i
mobilen via gratisappen ntfy. Sedan bokar du tiden själv direkt på sidan.

Funktioner
• Flera bevakningar med olika datum och orter samtidigt
• Larm med ljud, notis i datorn och valfri notis i mobilen
• Pausar när du loggas ut och fortsätter av sig själv när du loggat in igen
• Orter och inställningar sparas, så du behöver inte ställa in allt på nytt

Bra att veta
• Tillägget bokar ingenting. Du väljer och bokar alltid själv.
• Fliken måste vara öppen och datorn vaken för att bevakningen ska fungera.
• Inloggningen hos Trafikverket går ut efter en tid. Då behöver du logga in med BankID igen.
• Dina sökningar sparas bara i din webbläsare. Om du slår på mobilnotiser skickas ort, datum
  och tid via ntfy.sh, inga personuppgifter.
• Trafikverkets bokningsvillkor förbjuder automatiska tjänster som bokar prov. Tillägget bokar
  inte, men det gör automatiska sökningar i ditt konto, så använd det med måtta och på egen risk.

Tillägget är inte gjort av och har ingen koppling till Trafikverket.

Källkod och integritetspolicy: https://github.com/pellipro/provtidsbevakning

## Butiksikon
store/store-icon-128x128.png (samma som extension/icons/icon128.png, källfil store/icon.svg)

## Skärmbild
store/screenshot-1280x800.png

## Kategori
Verktyg (Tools)

## Språk
Svenska

## Integritetspolicy (URL)
https://github.com/pellipro/provtidsbevakning/blob/main/PRIVACY.md

## Fliken "Sekretesspraxis" / Privacy practices
- **Enda syfte (single purpose):** Larma användaren när en ledig provtid dyker upp i Trafikverkets
  bokning på fp.trafikverket.se.
- **Motivering för värdbehörighet (host permission, fp.trafikverket.se):** Tillägget behöver
  köras på Trafikverkets bokningssida för att läsa användarens egna sökningar, upprepa dem och
  visa bevakningsrutan. Det körs inte på någon annan webbplats.
- **Fjärrkod (remote code):** Nej. All kod finns i paketet.
- **Datainsamling:** Personligt identifierbar information (personnummer kan ingå i de sökningar
  som sparas lokalt för att kunna upprepas). Sparas bara lokalt i webbläsaren och överförs inte
  till utvecklaren.
- **Intyga:** säljs inte till tredje part, används inte för ändamål utanför tilläggets syfte,
  används inte för kreditprövning.
