'use strict';

// ============================================================
//  Voorbeelddata om de app mee uit te proberen.
//  Prijzen en scores zijn indicatief.
// ============================================================

function sampleData() {
  const keuken = { id: uid(), name: 'Keuken', rows: 4, cols: 6 };
  const kelder = { id: uid(), name: 'Kelder', rows: 6, cols: 10 };

  // [naam, producent, jaar, kleur, druif, land, regio, aantal, waarvan in rek, prijs, waarde, score, scorebron, drinkVan, drinkTot, rek]
  const rows = [
    ['Château Cantemerle', 'Château Cantemerle', 2016, 'rood', 'Cabernet Sauvignon, Merlot', 'Frankrijk', 'Bordeaux', 3, 3, 32, 38, 92, 'Wine Spectator', 2022, 2035, kelder],
    ['Barolo Serralunga', 'Fontanafredda', 2018, 'rood', 'Nebbiolo', 'Italië', 'Piemonte', 2, 2, 35, 40, 93, 'eigen', 2025, 2040, kelder],
    ['Chianti Classico Riserva', 'Fèlsina', 2019, 'rood', 'Sangiovese', 'Italië', 'Toscane', 4, 3, 24, 26, 91, 'eigen', 2023, 2032, kelder],
    ['Viña Ardanza Reserva', 'La Rioja Alta', 2016, 'rood', 'Tempranillo, Garnacha', 'Spanje', 'Rioja', 3, 3, 28, 30, 93, 'Decanter', 2022, 2034, kelder],
    ['Riesling Kabinett', 'Dr. Loosen', 2021, 'wit', 'Riesling', 'Duitsland', 'Moezel', 4, 4, 16, 17, 90, 'eigen', 2023, 2031, keuken],
    ['Sancerre Blanc', 'Domaine Vacheron', 2022, 'wit', 'Sauvignon Blanc', 'Frankrijk', 'Loire', 2, 2, 27, 28, 91, 'eigen', 2023, 2027, keuken],
    ['Sauvignon Blanc', 'Cloudy Bay', 2023, 'wit', 'Sauvignon Blanc', 'Nieuw-Zeeland', 'Marlborough', 1, 1, 30, 30, 90, 'Vivino', 2024, 2026, keuken],
    ['Brut Réserve', 'Charles Heidsieck', null, 'mousserend', 'Chardonnay, Pinot Noir', 'Frankrijk', 'Champagne', 2, 2, 45, 48, 93, 'eigen', null, null, keuken],
    ['Malbec', 'Catena', 2020, 'rood', 'Malbec', 'Argentinië', 'Mendoza', 3, 2, 15, 15, 89, 'eigen', 2022, 2027, kelder],
    ['Bin 389 Cabernet Shiraz', 'Penfolds', 2019, 'rood', 'Cabernet Sauvignon, Shiraz', 'Australië', 'Barossa Valley', 1, 1, 75, 85, 95, 'Parker', 2026, 2045, kelder],
    ['10 Year Old Tawny', "Taylor's", null, 'versterkt', 'Touriga Nacional', 'Portugal', 'Douro', 1, 1, 30, 30, 92, 'eigen', null, null, kelder],
    ['Pinotage', 'Kanonkop', 2019, 'rood', 'Pinotage', 'Zuid-Afrika', 'Stellenbosch', 2, 2, 33, 36, 92, 'eigen', 2024, 2035, kelder],
    ['Whispering Angel', "Château d'Esclans", 2023, 'rose', 'Grenache, Cinsault', 'Frankrijk', 'Provence', 2, 2, 22, 22, 88, 'Vivino', 2024, 2025, keuken],
    ['Tokaji Aszú 5 Puttonyos', 'Royal Tokaji', 2017, 'dessert', 'Furmint', 'Hongarije', 'Tokaj', 1, 1, 40, 45, 94, 'eigen', 2022, 2045, kelder],
    ['Lytton Springs', 'Ridge', 2019, 'rood', 'Zinfandel', 'Verenigde Staten', 'Sonoma', 1, 1, 55, 60, 94, 'eigen', 2023, 2035, kelder],
  ];

  // Leg de flessen per rek op de eerstvolgende vrije plek
  const nextSlot = { [keuken.id]: 0, [kelder.id]: 0 };
  const wines = rows.map(([name, producer, vintage, color, grape, country, region, quantity, inRack,
                            purchasePrice, value, score, scoreSource, drinkFrom, drinkUntil, rack]) => {
    const positions = [];
    for (let i = 0; i < inRack; i++) {
      const n = nextSlot[rack.id]++;
      positions.push({ rackId: rack.id, row: Math.floor(n / rack.cols), col: n % rack.cols });
    }
    return { id: uid(), name, producer, vintage, color, grape, country, region, quantity, purchasePrice, value,
             score, scoreSource, drinkFrom, drinkUntil, notes: '', positions, drunk: 0, added: today() };
  });

  // Een wijn die al op is, om te laten zien dat die bewaard blijft
  wines.push({ id: uid(), name: 'Crozes-Hermitage', producer: 'Alain Graillot', vintage: 2020, color: 'rood',
               grape: 'Syrah', country: 'Frankrijk', region: 'Rhône', quantity: 0, purchasePrice: 29, value: 29,
               score: 91, scoreSource: 'eigen', drinkFrom: 2023, drinkUntil: 2030, notes: 'Heerlijk bij wild.',
               positions: [], drunk: 2, added: today() });

  const wishlist = [
    { id: uid(), name: 'Sassicaia', producer: 'Tenuta San Guido', vintage: 2020, color: 'rood', priority: 'hoog',
      country: 'Italië', region: 'Bolgheri', price: 250, shop: '', notes: 'Voor een speciale gelegenheid' },
    { id: uid(), name: 'Valbuena 5°', producer: 'Vega Sicilia', vintage: 2018, color: 'rood', priority: 'middel',
      country: 'Spanje', region: 'Ribera del Duero', price: 150, shop: '', notes: '' },
    { id: uid(), name: 'Brut Réserve', producer: 'Pol Roger', vintage: null, color: 'mousserend', priority: 'middel',
      country: 'Frankrijk', region: 'Champagne', price: 50, shop: '', notes: '' },
    { id: uid(), name: 'Pinot Noir', producer: 'Dog Point', vintage: 2021, color: 'rood', priority: 'laag',
      country: 'Nieuw-Zeeland', region: 'Marlborough', price: 35, shop: '', notes: '' },
  ];

  return { racks: [keuken, kelder], wines, wishlist };
}
