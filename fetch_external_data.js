const fs = require('fs');
const https = require('https');
const path = require('path');

const dataDir = path.join(__dirname, 'public', 'data');
fs.mkdirSync(dataDir, { recursive: true });


function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'NodeJS/DroneMapFetcher' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Kunde inte tolka JSON: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'NodeJS/DroneMapFetcher' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Custom parser to convert Naturvårdsverket WFS GML to GeoJSON features array
function parseNvrGmlFeatures(gmlText) {
  const features = [];
  const memberRegex = /<gml:featureMember>([\s\S]*?)<\/gml:featureMember>/g;
  let match;

  while ((match = memberRegex.exec(gmlText)) !== null) {
    const memberText = match[1];
    
    // Extract metadata
    const nameMatch = /<Naturvardsregistret_WFS:NAMN>(.*?)<\/Naturvardsregistret_WFS:NAMN>/.exec(memberText);
    const typeMatch = /<Naturvardsregistret_WFS:SKYDDSTYP>(.*?)<\/Naturvardsregistret_WFS:SKYDDSTYP>/.exec(memberText);
    const idMatch = /<Naturvardsregistret_WFS:NVRID>(.*?)<\/Naturvardsregistret_WFS:NVRID>/.exec(memberText);
    const areaMatch = /<Naturvardsregistret_WFS:AREA_HA>(.*?)<\/Naturvardsregistret_WFS:AREA_HA>/.exec(memberText);

    if (!nameMatch || !typeMatch) continue;

    const name = nameMatch[1];
    const skyddstyp = typeMatch[1];
    const nvrid = idMatch ? idMatch[1] : '';
    const areaHa = areaMatch ? parseFloat(areaMatch[1]) : 0;

    // Extract Polygons and coordinates
    const polygons = [];
    const polygonRegex = /<gml:Polygon[^>]*>([\s\S]*?)<\/gml:Polygon>/g;
    let polyMatch;

    while ((polyMatch = polygonRegex.exec(memberText)) !== null) {
      const polyText = polyMatch[1];
      const posListMatch = /<gml:posList>([\s\S]*?)<\/gml:posList>/.exec(polyText);
      if (posListMatch) {
        const coordsStr = posListMatch[1].trim();
        const coords = coordsStr.split(/\s+/).map(Number);
        
        const ring = [];
        for (let i = 0; i < coords.length; i += 2) {
          const lat = coords[i];
          const lng = coords[i+1];
          if (!isNaN(lat) && !isNaN(lng)) {
            ring.push([lng, lat]); // GeoJSON is [longitude, latitude]
          }
        }
        if (ring.length >= 3) {
          polygons.push(ring);
        }
      }
    }

    if (polygons.length > 0) {
      const feature = {
        type: "Feature",
        id: `NVR.${nvrid}`,
        geometry: {
          type: polygons.length === 1 ? "Polygon" : "MultiPolygon",
          coordinates: polygons.length === 1 ? polygons : polygons.map(ring => [ring])
        },
        properties: {
          name: name,
          skyddstyp: skyddstyp,
          areaHa: areaHa,
          nvrid: nvrid,
          type: "CONDITIONAL",
          reason: "ENVIRONMENT"
        }
      };

      features.push(feature);
    }
  }

  return features;
}

const counties = [
  { id: 'blekinge', name: 'Blekinge Län' },
  { id: 'dalarna', name: 'Dalarnas Län' },
  { id: 'gotland', name: 'Gotlands Län' },
  { id: 'gavleborg', name: 'Gävleborgs Län' },
  { id: 'halland', name: 'Hallands Län' },
  { id: 'jamtland', name: 'Jämtlands Län' },
  { id: 'jonkoping', name: 'Jönköpings Län' },
  { id: 'kalmar', name: 'Kalmar Län' },
  { id: 'kronoberg', name: 'Kronobergs Län' },
  { id: 'norrbotten', name: 'Norrbottens Län' },
  { id: 'skane', name: 'Skåne Län' },
  { id: 'stockholm', name: 'Stockholms Län' },
  { id: 'sodermanland', name: 'Södermanlands Län' },
  { id: 'uppsala', name: 'Uppsala Län' },
  { id: 'varmland', name: 'Värmlands Län' },
  { id: 'vasterbotten', name: 'Västerbottens Län' },
  { id: 'vasternorrland', name: 'Västernorrlands Län' },
  { id: 'vastmanland', name: 'Västmanlands Län' },
  { id: 'vastra_gotaland', name: 'Västra Götalands Län' },
  { id: 'orebro', name: 'Örebro Län' },
  { id: 'ostergotland', name: 'Östergötlands Län' }
];

async function start() {
  console.log('--- STARTAR SVERIGETÄCKANDE DATAHÄMTNING ---');

  // 1. Fetch CTRs (All of Sweden)
  try {
    console.log('Hämtar CTR (Kontrollzoner) för hela Sverige från LFV...');
    const url = 'https://daim.lfv.se/geoserver/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=mais:CTR&outputFormat=application/json';
    const geojson = await fetchJson(url);
    const features = geojson.features || [];
    
    features.forEach(f => {
      f.properties.name = f.properties.NAMEOFAREA || 'Okänd CTR';
      f.properties.type = 'REQ_AUTHORIZATION';
      f.properties.reason = ['AIR_TRAFFIC'];
      f.properties.layer = {
        lower: f.properties.LOWER || 'GND',
        upper: f.properties.UPPER || '2000',
        uom: 'ft',
        lowerReference: 'AMSL',
        upperReference: 'AMSL'
      };
    });

    fs.writeFileSync(path.join(dataDir, 'ctrs_sverige.json'), JSON.stringify({ type: 'FeatureCollection', features: features }, null, 2));
    console.log(`Sparade ${features.length} CTRs i data/ctrs_sverige.json`);
  } catch (e) {
    console.error('Fel vid hämtning av CTR:', e.message);
  }

  // 2. Fetch Restricted Areas (RSTA) (All of Sweden)
  try {
    console.log('Hämtar R-områden (Restriktioner) för hela Sverige från LFV...');
    const url = 'https://daim.lfv.se/geoserver/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=mais:RSTA&outputFormat=application/json';
    const geojson = await fetchJson(url);
    const features = geojson.features || [];
    
    features.forEach(f => {
      f.properties.name = f.properties.NAMEOFAREA || 'Skyddsområde';
      f.properties.type = 'REQ_AUTHORIZATION';
      f.properties.reason = ['SENSITIVE'];
      f.properties.comment = f.properties.COMMENT_2 || '';
      f.properties.layer = {
        lower: f.properties.LOWER || 'GND',
        upper: f.properties.UPPER || 'UNL',
        uom: 'ft',
        lowerReference: 'AGL',
        upperReference: 'AMSL'
      };
    });

    fs.writeFileSync(path.join(dataDir, 'rsta_sverige.json'), JSON.stringify({ type: 'FeatureCollection', features: features }, null, 2));
    console.log(`Sparade ${features.length} R-områden i data/rsta_sverige.json`);
  } catch (e) {
    console.error('Fel vid hämtning av Restricted Areas:', e.message);
  }

  // 3. Fetch Airports (ARP) (All of Sweden)
  try {
    console.log('Hämtar flygplatser/heliportar (ARP) för hela Sverige från LFV...');
    const url = 'https://daim.lfv.se/geoserver/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=mais:ARP&outputFormat=application/json';
    const geojson = await fetchJson(url);
    const features = geojson.features || [];
    
    features.forEach(f => {
      f.properties.name = f.properties.LOCATION || 'Flygplats';
      f.properties.type = 'REQ_AUTHORIZATION';
      f.properties.reason = ['AIR_TRAFFIC'];
      f.properties.indicator = f.properties.POSITIONINDICATOR || '';
    });

    fs.writeFileSync(path.join(dataDir, 'airports_sverige.json'), JSON.stringify({ type: 'FeatureCollection', features: features }, null, 2));
    console.log(`Sparade ${features.length} flygplatser/heliportar i data/airports_sverige.json`);
  } catch (e) {
    console.error('Fel vid hämtning av Airports:', e.message);
  }

  // 3b. Fetch Helipads (HKP1K) (All of Sweden)
  try {
    console.log('Hämtar helikopterflygplatser skyddszoner (HKP1K) från LFV...');
    const url = 'https://daim.lfv.se/geoserver/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=DAIM_TOPO:HKP1K&outputFormat=application/json';
    const geojson = await fetchJson(url);
    const features = geojson.features || [];
    
    features.forEach(f => {
      f.properties.name = f.properties.LOCATION || 'Helikopterflygplats';
      f.properties.type = 'REQ_AUTHORIZATION';
      f.properties.reason = ['AIR_TRAFFIC'];
      f.properties.indicator = f.properties.POSITIONIN || '';
      f.properties.comment = f.properties.COM_SE || '';
    });

    fs.writeFileSync(path.join(dataDir, 'helipads_sverige.json'), JSON.stringify({ type: 'FeatureCollection', features: features }, null, 2));
    console.log(`Sparade ${features.length} helikopterflygplatser i data/helipads_sverige.json`);
  } catch (e) {
    console.error('Fel vid hämtning av helikopterflygplatser (HKP1K):', e.message);
  }

  // 3c. Fetch Runway Protection Zones (RWY5K) (All of Sweden)
  try {
    console.log('Hämtar landningsbanor skyddszoner (RWY5K) från LFV...');
    const url = 'https://daim.lfv.se/geoserver/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=DAIM_TOPO:RWY5K&outputFormat=application/json';
    const geojson = await fetchJson(url);
    const features = geojson.features || [];
    
    features.forEach(f => {
      f.properties.name = f.properties.NAMEOFAREA || 'Landningsbana skyddsområde';
      f.properties.type = 'REQ_AUTHORIZATION';
      f.properties.reason = ['AIR_TRAFFIC'];
      f.properties.indicator = f.properties.POSITIONIN || '';
    });

    fs.writeFileSync(path.join(dataDir, 'rwy5k_sverige.json'), JSON.stringify({ type: 'FeatureCollection', features: features }, null, 2));
    console.log(`Sparade ${features.length} skyddszoner (RWY5K) i data/rwy5k_sverige.json`);
  } catch (e) {
    console.error('Fel vid hämtning av skyddszoner (RWY5K):', e.message);
  }

  // 4. Fetch Temporary restrictions (AIP SUP + Live dynamic NOTAM archive)
  let combinedSupplements = [];
  
  // A. Fetch AIP Supplements (DAIM_TOPO:SUP)
  try {
    console.log('Hämtar tillfälliga restriktionsområden (AIP SUP) för hela Sverige från LFV...');
    const url = 'https://daim.lfv.se/geoserver/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=DAIM_TOPO:SUP&outputFormat=application/json';
    const geojson = await fetchJson(url);
    const features = geojson.features || [];
    
    features.forEach(f => {
      f.properties.name = f.properties.NAME || 'Tillfällig zon';
      f.properties.type = 'REQ_AUTHORIZATION';
      f.properties.reason = ['OTHER'];
      f.properties.comment = f.properties.COM_SE || '';
      f.properties.validFrom = f.properties.FROM || '';
      f.properties.validTo = f.properties.TO || '';
      f.properties.layer = {
        lower: f.properties.LOWER || 'GND',
        upper: f.properties.UPPER || '1500',
        uom: f.properties.UP_UOM || 'ft AMSL',
        lowerReference: 'AGL',
        upperReference: 'AMSL'
      };
    });
    
    combinedSupplements = combinedSupplements.concat(features);
    console.log(`Hämtade ${features.length} AIP-tillägg.`);
  } catch (e) {
    console.error('Fel vid hämtning av AIP SUP:', e.message);
  }

  // B. Fetch Live dynamic NOTAM restrictions (dynais:NOTAM)
  try {
    console.log('Hämtar aktiva NOTAM-områden (dynais:NOTAM) från LFV...');
    const todayIso = new Date().toISOString().split('T')[0] + 'T00:00:00Z';
    const notamUrl = `https://daim.lfv.se/geoserver/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=dynais:NOTAM&outputFormat=application/json&cql_filter=(CODE23%20ilike%20%27R%25%27%20OR%20CODE23%20ilike%20%27W%25%27)%20AND%20CODE45%20%3C%3E%20%27TT%27%20AND%20ENDVALIDITY%20%3E%3D%20%27${todayIso}%27`;
    
    const geojson = await fetchJson(notamUrl);
    const features = geojson.features || [];
    
    features.forEach(f => {
      const props = f.properties;
      const notamId = `${props.NOF || 'ESSA'}-${props.SERIES || 'A'}${props.NO || '0000'}/${props.YEAR || '26'}`;
      
      let cleanName = `NOTAM ${notamId}`;
      const nameMatch = /(ESR\d+|ESD\d+|ESTRA\d+|[A-Z\xC0-\xDF]{4,})\b/i.exec(props.ITEM_E || '');
      if (nameMatch) {
        cleanName = `NOTAM ${notamId} (${nameMatch[0]})`;
      }

      f.properties = {
        name: cleanName,
        type: 'REQ_AUTHORIZATION',
        reason: ['OTHER'],
        comment: props.ITEM_E || 'Tillfällig NOTAM-restriktion.',
        validFrom: props.STARTVALIDITY || '',
        validTo: props.ENDVALIDITY || '',
        layer: {
          lower: props.LOWER !== undefined ? `FL ${props.LOWER}` : 'GND',
          upper: props.UPPER !== undefined ? `FL ${props.UPPER}` : 'UNL',
          uom: '',
          lowerReference: 'STD',
          upperReference: 'STD'
        }
      };
    });

    combinedSupplements = combinedSupplements.concat(features);
    console.log(`Hämtade ${features.length} aktiva NOTAM-luftrum.`);
  } catch (e) {
    console.error('Fel vid hämtning av aktiva NOTAMs:', e.message);
  }

  // Save merged supplements file
  fs.writeFileSync(path.join(dataDir, 'supplements_sverige.json'), JSON.stringify({ type: 'FeatureCollection', features: combinedSupplements }, null, 2));
  console.log(`Sparade totalt ${combinedSupplements.length} tillfälliga restriktioner (NOTAM/SUP) i data/supplements_sverige.json`);

  // 5. Fetch Nature Reserves for each of the 21 Counties (Län) using OGC XML Filter
  console.log('Påbörjar hämtning av länsindelade naturreservat med XML-filter...');
  
  for (const county of counties) {
    try {
      console.log(`Hämtar naturreservat för: ${county.name}...`);
      let countyReserves = [];
      let startIndex = 0;
      const maxFeaturesPage = 500;
      let keepFetching = true;

      while (keepFetching) {
        // Construct WFS OGC XML filter
        const filterXml = `<Filter><And><PropertyIsEqualTo><PropertyName>LAN</PropertyName><Literal>${county.name}</Literal></PropertyIsEqualTo><PropertyIsEqualTo><PropertyName>SKYDDSTYP</PropertyName><Literal>Naturreservat</Literal></PropertyIsEqualTo></And></Filter>`;
        const encodedFilter = encodeURIComponent(filterXml);
        
        const url = `https://geodata.naturvardsverket.se/naturvardsregistret/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=Naturvardsregistret_WFS:SkyddadeOmraden&filter=${encodedFilter}&srsName=EPSG:4326&maxFeatures=${maxFeaturesPage}&startIndex=${startIndex}`;
        
        const gmlText = await fetchText(url);
        const pageFeatures = parseNvrGmlFeatures(gmlText);
        
        const rawCount = (gmlText.match(/<gml:featureMember>/g) || []).length;
        countyReserves = countyReserves.concat(pageFeatures);

        console.log(`  Sida ${startIndex/maxFeaturesPage + 1}: Hämtade ${rawCount} features, tolkade ${pageFeatures.length} polygoner.`);

        if (rawCount < maxFeaturesPage) {
          keepFetching = false;
        } else {
          startIndex += maxFeaturesPage;
        }
      }

      const destFile = path.join(dataDir, `reservat_${county.id}.json`);
      fs.writeFileSync(destFile, JSON.stringify({ type: 'FeatureCollection', features: countyReserves }, null, 2));
      console.log(`✓ Sparade ${countyReserves.length} reservat i data/reservat_${county.id}.json`);
    } catch (e) {
      console.error(`❌ Fel vid hämtning av naturreservat för ${county.name}:`, e.message);
    }
  }

  // Save update metadata timestamp file
  const metaDest = path.join(dataDir, 'last_update.json');
  fs.writeFileSync(metaDest, JSON.stringify({ lastUpdate: new Date().toISOString() }, null, 2));
  console.log(`✓ Sparade tidsstämpel i data/last_update.json`);

  console.log('--- ALLA FILER NEDLADDADE OCH KLARA ---');
}

start();
