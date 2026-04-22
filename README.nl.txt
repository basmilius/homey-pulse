Pulse houdt stilletjes bij wat er in je huis gebeurt, en maakt er iets leesbaars van.

Elke verandering aan je apparaten — lichten die aangaan, sensoren die afgaan, temperaturen die schommelen — wordt op de achtergrond gelogd. Aan het einde van de dag maakt een AI-model van jouw keuze er een korte, menselijke samenvatting van en markeert alles wat opvalt.

Mogelijkheden:
- Automatisch bijhouden van alle capability-wijzigingen van je apparaten, gegroepeerd per zone
- Slimme classificatie: alarmen en schakelaars worden direct gelogd, doorlopende metingen worden op een instelbaar interval bemonsterd
- AI-samenvattingen per dag via Anthropic Claude, OpenAI ChatGPT of Google Gemini
- Anomaliedetectie met ernstniveau, geactiveerd als flow-trigger
- Handmatig eigen gebeurtenissen loggen vanuit een flow om de samenvatting te verrijken
- Zones of capabilities uit te sluiten van tracking
- Instelbare bewaartermijn; oudere data wordt automatisch opgeruimd
- Alle events blijven lokaal op je Homey

Flow-kaarten:
- Actie: Genereer een samenvatting voor vandaag
- Actie: Log een eigen gebeurtenis
- Voorwaarde: Aantal events vandaag boven een drempel
- Trigger: Samenvatting klaar
- Trigger: Anomalie gedetecteerd

Vereisten:
- Een account bij Anthropic, OpenAI of Google AI Studio
- Een geldige API-sleutel voor de gekozen aanbieder (in te stellen via de app-instellingen)
