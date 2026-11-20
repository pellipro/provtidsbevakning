# Provtidsbevakning för Trafikverket

Ett Chrome-tillägg som håller koll på lediga förarprovstider i Trafikverkets bokning
(fp.trafikverket.se) och larmar med ljud, notis i datorn och, om du vill, pushnotis i mobilen
när en tid dyker upp inom de datum du valt.

**Tillägget bokar ingenting.** Du får ett larm och bokar själv, som vanligt, med BankID.

## Installera

**Från Chrome Web Store:** sök på "Provtidsbevakning för Trafikverket" (när det är publicerat).

**Manuellt:**
1. Ladda ner repot (Code → Download ZIP) och packa upp det.
2. Öppna `chrome://extensions` och slå på **Utvecklarläge** uppe till höger.
3. Klicka **Läs in okomprimerat tillägg** och välj mappen `extension`.

## Använda

1. Logga in med BankID på https://fp.trafikverket.se/Boka/ng/ och välj prov.
2. I rutan nere till höger: välj datum under **Ny bevakning** och klicka **Skapa bevakning**.
3. Sök på sidan på varje ort du vill bevaka, så läggs orterna till i bevakningen. Klicka **Klar**.
4. Klicka **Aktivera notiser och ljud**.
5. Valfritt: klicka **Slå på mobilnotiser**, installera appen [ntfy](https://ntfy.sh) och
   prenumerera på ämnet som visas. Klicka **Testa larm** för att prova.
6. Låt fliken vara öppen och datorn vaken. Efter en utloggning räcker det att logga in igen,
   så fortsätter bevakningen.

Du kan ha flera bevakningar med olika datum och orter samtidigt.

## Bra att veta

- Bevakningen gör ungefär en kontroll per ort och minut, i din egen inloggade session.
  Ha bara en handfull orter.
- Trafikverkets [bokningsvillkor](https://www.trafikverket.se/bokningsvillkor) förbjuder
  automatiska bokningstjänster (botar) som bokar prov. Tillägget bokar inte, men det gör
  automatiska sökningar i ditt konto. Använd det på egen risk.
- Se [PRIVACY.md](PRIVACY.md) för vilka uppgifter som sparas och skickas.
- Tillägget har ingen koppling till Trafikverket.

## Licens

MIT, se [LICENSE](LICENSE).
