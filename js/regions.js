'use strict';

// ============================================================
//  Coördinaten van wijnlanden en -regio's voor de kaart.
//  Staat je regio er niet bij? Voeg hem gewoon toe aan
//  WINE_REGIONS. Onbekende regio's vallen terug op het land.
// ============================================================

const WINE_COUNTRIES = {
  'Frankrijk': [46.6, 2.4],
  'Italië': [42.8, 12.5],
  'Spanje': [40.2, -3.7],
  'Portugal': [39.6, -8.0],
  'Duitsland': [50.6, 9.0],
  'Oostenrijk': [47.6, 14.1],
  'Zwitserland': [46.8, 8.2],
  'Griekenland': [39.1, 22.0],
  'Hongarije': [47.2, 19.4],
  'Slovenië': [46.1, 14.8],
  'Kroatië': [45.1, 15.2],
  'Roemenië': [45.9, 24.9],
  'Bulgarije': [42.7, 25.5],
  'Moldavië': [47.4, 28.4],
  'Georgië': [42.0, 43.5],
  'Libanon': [33.85, 35.86],
  'Israël': [31.5, 34.9],
  'Nederland': [52.2, 5.5],
  'België': [50.6, 4.6],
  'Luxemburg': [49.6, 6.1],
  'Verenigd Koninkrijk': [51.2, 0.5],
  'Verenigde Staten': [38.0, -120.5],
  'Canada': [43.1, -79.2],
  'Mexico': [32.0, -116.6],
  'Chili': [-34.0, -71.0],
  'Argentinië': [-33.5, -68.0],
  'Uruguay': [-34.5, -56.0],
  'Brazilië': [-29.2, -51.5],
  'Zuid-Afrika': [-33.9, 19.0],
  'Australië': [-34.5, 138.5],
  'Nieuw-Zeeland': [-41.5, 173.5],
  'China': [38.5, 106.3],
  'Japan': [35.7, 138.6],
};

// Engelse en andere varianten van landnamen
const COUNTRY_ALIASES = {
  france: 'Frankrijk', italy: 'Italië', italia: 'Italië', spain: 'Spanje', espana: 'Spanje',
  germany: 'Duitsland', deutschland: 'Duitsland', austria: 'Oostenrijk', osterreich: 'Oostenrijk',
  switzerland: 'Zwitserland', greece: 'Griekenland', hungary: 'Hongarije', slovenia: 'Slovenië',
  croatia: 'Kroatië', romania: 'Roemenië', bulgaria: 'Bulgarije', moldova: 'Moldavië',
  georgia: 'Georgië', lebanon: 'Libanon', israel: 'Israël', netherlands: 'Nederland',
  belgium: 'België', belgie: 'België', luxembourg: 'Luxemburg', england: 'Verenigd Koninkrijk',
  uk: 'Verenigd Koninkrijk', engeland: 'Verenigd Koninkrijk', usa: 'Verenigde Staten',
  'united states': 'Verenigde Staten', amerika: 'Verenigde Staten', vs: 'Verenigde Staten',
  chile: 'Chili', argentina: 'Argentinië', brazil: 'Brazilië', 'south africa': 'Zuid-Afrika',
  australia: 'Australië', 'new zealand': 'Nieuw-Zeeland',
};

const WINE_REGIONS = [
  // Frankrijk
  { name: 'Bordeaux', country: 'Frankrijk', at: [44.84, -0.58], aliases: ['medoc', 'pauillac', 'margaux', 'saint-emilion', 'pomerol', 'pessac', 'sauternes'] },
  { name: 'Bourgogne', country: 'Frankrijk', at: [47.05, 4.84], aliases: ['burgundy', 'cote de nuits', 'cote de beaune'] },
  { name: 'Chablis', country: 'Frankrijk', at: [47.81, 3.8] },
  { name: 'Champagne', country: 'Frankrijk', at: [49.04, 4.0] },
  { name: 'Rhône', country: 'Frankrijk', at: [44.9, 4.8], aliases: ['rhone', 'chateauneuf', 'cote-rotie', 'hermitage'] },
  { name: 'Loire', country: 'Frankrijk', at: [47.3, 0.5], aliases: ['sancerre', 'vouvray', 'muscadet', 'pouilly-fume'] },
  { name: 'Elzas', country: 'Frankrijk', at: [48.2, 7.35], aliases: ['alsace'] },
  { name: 'Beaujolais', country: 'Frankrijk', at: [46.1, 4.6] },
  { name: 'Languedoc', country: 'Frankrijk', at: [43.4, 3.2] },
  { name: 'Roussillon', country: 'Frankrijk', at: [42.7, 2.8] },
  { name: 'Provence', country: 'Frankrijk', at: [43.5, 6.0] },
  { name: 'Jura', country: 'Frankrijk', at: [46.8, 5.7] },
  { name: 'Sud-Ouest', country: 'Frankrijk', at: [44.0, 0.5], aliases: ['cahors', 'madiran', 'bergerac'] },
  // Italië
  { name: 'Piemonte', country: 'Italië', at: [44.7, 8.0], aliases: ['piedmont', 'barolo', 'barbaresco'] },
  { name: 'Toscane', country: 'Italië', at: [43.4, 11.2], aliases: ['toscana', 'tuscany', 'chianti', 'montalcino', 'montepulciano'] },
  { name: 'Bolgheri', country: 'Italië', at: [43.23, 10.61] },
  { name: 'Veneto', country: 'Italië', at: [45.5, 11.0], aliases: ['valpolicella', 'soave', 'prosecco', 'amarone'] },
  { name: 'Friuli', country: 'Italië', at: [46.0, 13.2] },
  { name: 'Alto Adige', country: 'Italië', at: [46.5, 11.3], aliases: ['sudtirol', 'zuid-tirol'] },
  { name: 'Lombardije', country: 'Italië', at: [45.6, 9.9], aliases: ['lombardia', 'franciacorta'] },
  { name: 'Marche', country: 'Italië', at: [43.3, 13.2] },
  { name: 'Umbrië', country: 'Italië', at: [42.9, 12.5], aliases: ['umbria'] },
  { name: 'Abruzzo', country: 'Italië', at: [42.2, 13.8] },
  { name: 'Campania', country: 'Italië', at: [41.0, 14.8] },
  { name: 'Puglia', country: 'Italië', at: [41.0, 16.5], aliases: ['apulie'] },
  { name: 'Sicilië', country: 'Italië', at: [37.6, 14.0], aliases: ['sicilia', 'sicily', 'etna'] },
  { name: 'Sardinië', country: 'Italië', at: [40.1, 9.0], aliases: ['sardegna'] },
  // Spanje
  { name: 'Rioja', country: 'Spanje', at: [42.4, -2.5] },
  { name: 'Ribera del Duero', country: 'Spanje', at: [41.65, -3.9] },
  { name: 'Priorat', country: 'Spanje', at: [41.15, 0.78] },
  { name: 'Penedès', country: 'Spanje', at: [41.35, 1.7], aliases: ['cava'] },
  { name: 'Rías Baixas', country: 'Spanje', at: [42.4, -8.7] },
  { name: 'Rueda', country: 'Spanje', at: [41.4, -4.95] },
  { name: 'Toro', country: 'Spanje', at: [41.5, -5.4] },
  { name: 'Navarra', country: 'Spanje', at: [42.7, -1.65] },
  { name: 'Jumilla', country: 'Spanje', at: [38.47, -1.33] },
  { name: 'Jerez', country: 'Spanje', at: [36.7, -6.1], aliases: ['sherry'] },
  // Portugal
  { name: 'Douro', country: 'Portugal', at: [41.15, -7.6], aliases: ['porto', 'port'] },
  { name: 'Alentejo', country: 'Portugal', at: [38.5, -7.9] },
  { name: 'Dão', country: 'Portugal', at: [40.6, -7.9] },
  { name: 'Vinho Verde', country: 'Portugal', at: [41.7, -8.3] },
  { name: 'Madeira', country: 'Portugal', at: [32.75, -16.95] },
  // Duitsland & Oostenrijk
  { name: 'Moezel', country: 'Duitsland', at: [49.9, 7.0], aliases: ['mosel'] },
  { name: 'Rheingau', country: 'Duitsland', at: [50.0, 8.0] },
  { name: 'Rheinhessen', country: 'Duitsland', at: [49.8, 8.1] },
  { name: 'Pfalz', country: 'Duitsland', at: [49.35, 8.15] },
  { name: 'Nahe', country: 'Duitsland', at: [49.8, 7.8] },
  { name: 'Baden', country: 'Duitsland', at: [48.3, 7.9] },
  { name: 'Franken', country: 'Duitsland', at: [49.8, 10.0] },
  { name: 'Wachau', country: 'Oostenrijk', at: [48.37, 15.43] },
  { name: 'Kamptal', country: 'Oostenrijk', at: [48.5, 15.7] },
  { name: 'Kremstal', country: 'Oostenrijk', at: [48.42, 15.6] },
  { name: 'Burgenland', country: 'Oostenrijk', at: [47.8, 16.6] },
  // Overig Europa
  { name: 'Tokaj', country: 'Hongarije', at: [48.12, 21.4], aliases: ['tokaji'] },
  { name: 'Santorini', country: 'Griekenland', at: [36.4, 25.43] },
  { name: 'Nemea', country: 'Griekenland', at: [37.82, 22.66] },
  // Verenigde Staten
  { name: 'Napa Valley', country: 'Verenigde Staten', at: [38.5, -122.3], aliases: ['napa'] },
  { name: 'Sonoma', country: 'Verenigde Staten', at: [38.5, -122.8] },
  { name: 'Paso Robles', country: 'Verenigde Staten', at: [35.6, -120.7] },
  { name: 'Santa Barbara', country: 'Verenigde Staten', at: [34.6, -120.1] },
  { name: 'Willamette Valley', country: 'Verenigde Staten', at: [45.1, -123.1], aliases: ['oregon'] },
  { name: 'Washington State', country: 'Verenigde Staten', at: [46.3, -119.5], aliases: ['columbia valley', 'walla walla'] },
  // Zuid-Amerika
  { name: 'Maipo', country: 'Chili', at: [-33.7, -70.7] },
  { name: 'Colchagua', country: 'Chili', at: [-34.6, -71.3] },
  { name: 'Casablanca', country: 'Chili', at: [-33.3, -71.4] },
  { name: 'Maule', country: 'Chili', at: [-35.5, -71.6] },
  { name: 'Mendoza', country: 'Argentinië', at: [-33.0, -68.8], aliases: ['uco valley', 'lujan de cuyo'] },
  { name: 'Salta', country: 'Argentinië', at: [-26.0, -65.97], aliases: ['cafayate'] },
  { name: 'Patagonië', country: 'Argentinië', at: [-39.0, -67.6], aliases: ['patagonia'] },
  // Zuid-Afrika
  { name: 'Stellenbosch', country: 'Zuid-Afrika', at: [-33.93, 18.86] },
  { name: 'Franschhoek', country: 'Zuid-Afrika', at: [-33.9, 19.12] },
  { name: 'Swartland', country: 'Zuid-Afrika', at: [-33.4, 18.7] },
  { name: 'Constantia', country: 'Zuid-Afrika', at: [-34.03, 18.43] },
  // Australië & Nieuw-Zeeland
  { name: 'Barossa Valley', country: 'Australië', at: [-34.53, 138.95], aliases: ['barossa'] },
  { name: 'McLaren Vale', country: 'Australië', at: [-35.22, 138.54] },
  { name: 'Clare Valley', country: 'Australië', at: [-33.8, 138.6] },
  { name: 'Coonawarra', country: 'Australië', at: [-37.3, 140.83] },
  { name: 'Margaret River', country: 'Australië', at: [-33.95, 115.07] },
  { name: 'Hunter Valley', country: 'Australië', at: [-32.8, 151.3] },
  { name: 'Yarra Valley', country: 'Australië', at: [-37.7, 145.5] },
  { name: 'Marlborough', country: 'Nieuw-Zeeland', at: [-41.5, 173.9] },
  { name: 'Central Otago', country: 'Nieuw-Zeeland', at: [-45.0, 169.2] },
  { name: "Hawke's Bay", country: 'Nieuw-Zeeland', at: [-39.6, 176.8] },
  { name: 'Martinborough', country: 'Nieuw-Zeeland', at: [-41.2, 175.45] },
];

// "Rhône" → "rhone": kleine letters, zonder accenten
function normalizeName(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function canonicalCountry(country) {
  const c = normalizeName(country);
  if (!c) return null;
  const direct = Object.keys(WINE_COUNTRIES).find(k => normalizeName(k) === c);
  return direct || COUNTRY_ALIASES[c] || null;
}

// Zoekt de plek op de kaart bij een land/regio.
// Geeft { label, lat, lng } terug, of null als het onbekend is.
function locate(country, region) {
  const r = normalizeName(region);
  if (r) {
    const names = reg => [reg.name, ...(reg.aliases || [])].map(normalizeName);
    const hit = WINE_REGIONS.find(reg => names(reg).includes(r))
             || WINE_REGIONS.find(reg => names(reg).some(n => r.includes(n)));
    if (hit) return { label: hit.name, lat: hit.at[0], lng: hit.at[1] };
  }
  const c = canonicalCountry(country);
  if (c) return { label: c, lat: WINE_COUNTRIES[c][0], lng: WINE_COUNTRIES[c][1] };
  return null;
}
