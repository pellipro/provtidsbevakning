# Underlag för Chrome Web Store

## Namn
Provtidsbevakning för Trafikverket

## Kort beskrivning (max 132 tecken)
Larmar när en ledig förarprovstid dyker upp i Trafikverkets bokning. Bokar ingenting – du bokar själv.

## Detaljerad beskrivning
Letar du efter en tid för körprov eller kunskapsprov? Provtidsbevakning håller koll på
Trafikverkets bokning åt dig och larmar så fort en ledig tid dyker upp inom de datum du valt.

• Välj ett eller flera datumintervall och de orter du vill bevaka
• Larm med ljud och notis i datorn
• Valfri pushnotis i mobilen via gratisappen ntfy
• Fortsätter av sig själv efter att du loggat in igen med BankID
• Bokar ingenting – du får ett larm och bokar själv, som vanligt

Så fungerar det: logga in på Trafikverkets bokning, skapa en bevakning i rutan nere till höger
och sök på de orter du vill bevaka. Låt fliken vara öppen, så kontrolleras tiderna ungefär en
gång i minuten.

Tillägget har ingen koppling till Trafikverket. Trafikverkets bokningsvillkor förbjuder
automatiska tjänster som bokar prov. Tillägget bokar inte, men gör automatiska sökningar i ditt
konto, så använd det på egen risk.

Källkod: https://github.com/pellipro/provtidsbevakning

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
