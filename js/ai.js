'use strict';

// ============================================================
//  Automatisch aanvullen via je Claude-abonnement
//  De app maakt een kant-en-klare vraag die je in een chat op
//  claude.ai plakt. Claude antwoordt met een JSON-blok (een
//  vast tekstformaat); dat plak je terug en de app vult de
//  velden in. Er is dus geen API-sleutel nodig.
// ============================================================

const AI_COLORS = ['rood', 'wit', 'rose', 'mousserend', 'dessert', 'versterkt'];
const AI_NUMBER_FIELDS = ['vintage', 'value', 'score', 'drinkFrom', 'drinkUntil'];
const AI_TEXT_FIELDS = ['name', 'producer', 'grape', 'country', 'region', 'scoreSource', 'notes'];

// Alleen gewone webadressen (geen javascript: of andere trucs)
function isWebUrl(value) {
  return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim());
}

const WineAI = {
  buildPrompt({ name, vintage, producer, hasPhoto }) {
    const known = [
      name && `Naam: ${name}`,
      vintage && `Jaargang: ${vintage}`,
      producer && `Producent: ${producer}`,
    ].filter(Boolean).join('\n');

    return `Ik houd mijn wijnkelder bij in een app. ${hasPhoto ? 'Bijgevoegd is een foto van het etiket. ' : ''}Zoek de gegevens op van deze wijn:

${known || '(zie de foto)'}

Zoek op internet naar de actuele prijs per fles (0,75 l) in euro, bij voorkeur bij Nederlandse of Europese wijnhandels, en naar scores van critici.

Antwoord met alleen het JSON-blok hieronder, ingevuld. Gebruik null als je iets niet weet of niet kunt vinden: liever leeg dan gegokt.

- found: false als je niet kunt bepalen om welke wijn het gaat
- certainty: hoe zeker je bent dat het de juiste wijn en jaargang is (hoog, middel of laag)
- color: één van rood, wit, rose, mousserend, dessert, versterkt
- country: in het Nederlands (bijv. Frankrijk, Italië, Verenigde Staten)
- region: de bekende wijnregio (bijv. Bordeaux, Piemonte, Rioja, Moezel), niet de appellation
- value: actuele prijs per fles in euro, alleen het getal
- score: op een schaal van 100; de bron in scoreSource (bijv. "Wine Spectator")
- drinkFrom / drinkUntil: het drinkvenster in jaren
- notes: 1 tot 3 zinnen in het Nederlands over stijl en smaak
- vivinoUrl: de link naar de pagina van deze wijn (en jaargang) op Vivino. Zoek de wijn op Vivino en open die pagina
- imageUrl: de flesfoto van die Vivino-pagina. Die staat op images.vivino.com en eindigt meestal op _pb_x600.png. Begint de link met //, zet er dan https: voor. Neem alleen een link over die je echt op de pagina hebt gezien, anders null

\`\`\`json
{
  "found": true,
  "certainty": "hoog",
  "name": "",
  "producer": "",
  "vintage": null,
  "color": "rood",
  "grape": "",
  "country": "",
  "region": "",
  "value": null,
  "score": null,
  "scoreSource": "",
  "drinkFrom": null,
  "drinkUntil": null,
  "notes": "",
  "vivinoUrl": null,
  "imageUrl": null
}
\`\`\``;
  },

  // Haalt het JSON-blok uit het antwoord, ook als er tekst of ``` omheen staat
  parseAnswer(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('Geen JSON gevonden. Kopieer het hele antwoord van Claude.');

    let raw;
    try {
      raw = JSON.parse(text.slice(start, end + 1));
    } catch {
      throw new Error('Het antwoord kon niet worden gelezen. Kopieer het codeblok uit het antwoord van Claude.');
    }

    // Opschonen: alleen velden die het formulier kent, in de juiste vorm
    const info = { found: raw.found !== false, certainty: raw.certainty || 'onbekend' };
    for (const key of AI_TEXT_FIELDS) {
      info[key] = typeof raw[key] === 'string' && raw[key].trim() ? raw[key].trim() : null;
    }
    for (const key of AI_NUMBER_FIELDS) {
      const n = Number(raw[key]);
      info[key] = raw[key] != null && raw[key] !== '' && Number.isFinite(n) ? n : null;
    }
    info.color = AI_COLORS.includes(raw.color) ? raw.color : null;
    for (const key of ['imageUrl', 'vivinoUrl']) {
      // Vivino schrijft links soms als //images.vivino.com/…; daar hoort https: voor
      const url = typeof raw[key] === 'string' ? raw[key].trim().replace(/^\/\//, 'https://') : null;
      info[key] = isWebUrl(url) ? url : null;
    }
    return info;
  },

  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Oudere manier, voor als de browser het klembord niet direct toestaat
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
  },

  // Het klembord accepteert alleen PNG, dus de foto wordt eerst omgezet
  async copyImage(dataUrl) {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  },
};
