import { mkdir, writeFile } from 'node:fs/promises';

const endpoint = 'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/ArcGIS/rest/services/Seattle_Streets_1/FeatureServer/0/query';
const north = process.argv.includes('--north');
const bounds = north ? [-122.365, 47.609, -122.332, 47.626] : [-122.347, 47.578, -122.320, 47.615];
const query = new URLSearchParams({ f: 'json', where: '1=1', geometry: bounds.join(','),
  geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
  outFields: 'OBJECTID,ONSTREET,ARTCLASS,ARTDESCRIPT,STREETTYPE,STATUS,INTKEYLO,INTKEYHI,SURFACEWIDTH',
  returnGeometry: 'true', orderByFields: 'OBJECTID', resultRecordCount: '2000' });
const result = await fetch(`${endpoint}?${query}`).then(response => {
  if (!response.ok) throw Error(`Seattle GIS: ${response.status}`);
  return response.json();
});
if (result.error || result.exceededTransferLimit) throw Error(JSON.stringify(result.error ?? 'Incomplete GIS extract'));
await mkdir('assets/maps/alder', { recursive: true });
await writeFile(`assets/maps/alder/${north ? 'source-north-streets' : 'source-streets'}.json`, JSON.stringify({
  source: endpoint, attribution: 'City of Seattle, Seattle Department of Transportation',
  terms: 'https://data.seattle.gov/stories/s/Terms-of-Use/6ukr-wvup/',
  retrieved: new Date().toISOString().slice(0, 10), bounds, features: result.features,
}) + '\n');
console.log(JSON.stringify({ features: result.features.length,
  types: [...new Set(result.features.map(f => f.attributes.STREETTYPE))],
  streets: [...new Set(result.features.map(f => f.attributes.ONSTREET))].sort() }));
