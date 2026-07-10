// ==========================================================================
// SVENSK DRÖNARKARTA - EXPANDED AIRSPACE LOGIC & RADAR THEME
// Sweden-wide airspace coverage + Dynamic county-level nature reserves
// ==========================================================================

// Initialize selected color palette theme
let selectedPalette = localStorage.getItem('selectedPalette') || 'green';
document.body.className = `palette-${selectedPalette}`;

// Global state variables
let map;
let zoneLayers = [];
let allFeatures = [];
let nationalFeatures = [];
let currentCountyReserves = [];
let userLocation = null;
let userMarker = null;
let destinationMarker = null;
let userRadiusCircle = null;

// Updates (or creates) the dashed geofence radius circle around the user marker
function updateGeofenceCircle() {
  if (!userLocation) return;

  if (userRadiusCircle) {
    userRadiusCircle.setLatLng(userLocation);
    userRadiusCircle.setRadius(maxFlightDistance);
  } else {
    userRadiusCircle = L.circle(userLocation, {
      radius: maxFlightDistance,
      color: '#f97316',
      weight: 2,
      opacity: 0.85,
      fillColor: '#f97316',
      fillOpacity: 0.06,
      dashArray: '8, 8',
      interactive: false
    }).addTo(map);
  }
}
let activeFilters = {
  REQ_AUTHORIZATION: true,
  CONDITIONAL: true,
  NO_RESTRICTION: true,
  nvr: true
};

// County centers and default zooms for auto-navigation
const countyViews = {
  blekinge: { center: [56.25, 15.0], zoom: 10 },
  dalarna: { center: [61.0, 14.5], zoom: 8 },
  gotland: { center: [57.5, 18.5], zoom: 9 },
  gavleborg: { center: [61.3, 16.5], zoom: 8 },
  halland: { center: [57.0, 12.5], zoom: 9 },
  jamtland: { center: [63.2, 14.2], zoom: 7 },
  jonkoping: { center: [57.5, 14.5], zoom: 9 },
  kalmar: { center: [57.2, 16.2], zoom: 8 },
  kronoberg: { center: [56.7, 14.7], zoom: 9 },
  norrbotten: { center: [67.0, 20.0], zoom: 7 },
  skane: { center: [55.9, 13.5], zoom: 9 },
  stockholm: { center: [59.35, 18.0], zoom: 9 },
  sodermanland: { center: [59.0, 16.8], zoom: 9 },
  uppsala: { center: [59.9, 17.5], zoom: 9 },
  varmland: { center: [59.6, 13.2], zoom: 8 },
  vasterbotten: { center: [65.0, 17.5], zoom: 7 },
  vasternorrland: { center: [63.0, 17.5], zoom: 8 },
  vastmanland: { center: [59.7, 16.2], zoom: 9 },
  vastra_gotaland: { center: [58.2, 12.8], zoom: 8 },
  orebro: { center: [59.5, 15.0], zoom: 9 },
  ostergotland: { center: [58.4, 15.8], zoom: 9 }
};

let selectedRegion = localStorage.getItem('selectedRegion') || 'skane';

// Approximate bounding boxes [minLat, maxLat, minLng, maxLng] per county
const countyBounds = {
  blekinge:        [55.95, 56.55, 14.10, 16.30],
  dalarna:         [59.80, 61.80, 12.80, 16.40],
  gotland:         [56.90, 58.00, 17.90, 19.30],
  gavleborg:       [60.60, 62.00, 14.80, 18.00],
  halland:         [56.30, 57.30, 12.00, 13.30],
  jamtland:        [61.80, 65.10, 12.00, 17.80],
  jonkoping:       [57.00, 58.00, 13.20, 15.70],
  kalmar:          [56.20, 57.80, 15.30, 17.10],
  kronoberg:       [56.30, 57.20, 13.50, 15.60],
  norrbotten:      [65.00, 69.10, 17.00, 24.20],
  skane:           [55.33, 56.45, 12.60, 14.60],
  stockholm:       [58.80, 59.90, 17.30, 19.20],
  sodermanland:    [58.60, 59.30, 15.80, 17.70],
  uppsala:         [59.50, 60.50, 16.60, 18.80],
  varmland:        [58.80, 60.70, 11.80, 14.50],
  vasterbotten:    [63.00, 66.00, 15.00, 21.00],
  vasternorrland:  [62.00, 63.80, 15.30, 18.50],
  vastmanland:     [59.30, 60.00, 15.20, 17.20],
  vastra_gotaland: [57.50, 59.10, 11.00, 14.80],
  orebro:          [58.80, 60.00, 14.00, 15.70],
  ostergotland:    [57.80, 58.80, 14.50, 16.60]
};

// Detect which county a lat/lng coordinate falls within
function detectCountyFromLatLng(lat, lng) {
  for (const [id, [minLat, maxLat, minLng, maxLng]] of Object.entries(countyBounds)) {
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      return id;
    }
  }
  return null; // outside Sweden or ambiguous
}

// Map tile layers
const tileLayers = {
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20
  }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 18
  }),
  light: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20
  }),
  radar: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; LFV &copy; Naturvårdsverket',
    maxZoom: 20
  })
};

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadAllAirspaceData();
  setupEventListeners();
  initLucide();
});

// Initialize Lucide icons
function initLucide() {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// --------------------------------------------------------------------------
// MAP INITIALIZATION
// --------------------------------------------------------------------------
function initMap() {
  // Center map on startup to saved region, default to Skåne
  const initialView = countyViews[selectedRegion] || countyViews.skane;
  
  map = L.map('map', {
    center: initialView.center,
    zoom: initialView.zoom,
    zoomControl: false // Add it later in custom position
  });

  // Add default tile layer
  tileLayers.dark.addTo(map);

  // Add custom zoom control position
  L.control.zoom({
    position: 'topright'
  }).addTo(map);

  // Trigger search update on map move
  map.on('moveend', updateLocalZonesList);

  // Map click listener to place destination marker (only when selection mode is active!)
  map.on('click', (e) => {
    if (window._mapSelectionActive) {
      setDestination(e.latlng.lat, e.latlng.lng);
      deactivateMapSelection();
    }
  });
}

// ── Destination / Target Flight Point Logic ───────────────────────────────
function setDestination(lat, lng) {
  const latLng = L.latLng(lat, lng);
  if (isCoordinateInRedZone(latLng)) {
    L.popup()
      .setLatLng(latLng)
      .setContent('<strong style="color: #ef4444; font-size: 0.9rem;">Ej tillåtet</strong><br><span style="font-size: 0.8rem;">Du kan inte sätta en flygpunkt i ett rött (tillståndskrävande) restriktionsområde.</span>')
      .openOn(map);
    return;
  }

  window._destLat = lat;
  window._destLng = lng;

  const card = document.getElementById('destination-card');
  const coordText = document.getElementById('dest-coords-text');
  const distRow = document.getElementById('dest-distance-row');
  const distVal = document.getElementById('dest-distance-val');

  if (coordText) {
    coordText.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  // Update distance to user if GPS is active
  if (userLocation && distRow && distVal) {
    const dist = userLocation.distanceTo(L.latLng(lat, lng));
    distRow.classList.remove('hidden');
    distVal.innerText = dist < 1000 ? `${Math.round(dist)} m` : `${(dist/1000).toFixed(2)} km`;
  } else if (distRow) {
    distRow.classList.add('hidden');
  }

  if (card) {
    card.classList.remove('hidden');
    initLucide();
  }

  // Move or draw marker
  if (destinationMarker) {
    destinationMarker.setLatLng([lat, lng]);
  } else {
    const targetIcon = L.divIcon({
      className: 'dest-marker-icon',
      html: '<i data-lucide="crosshair"></i>',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    destinationMarker = L.marker([lat, lng], { icon: targetIcon }).addTo(map);
    initLucide();
  }
}

function clearDestination() {
  window._destLat = undefined;
  window._destLng = undefined;

  const card = document.getElementById('destination-card');
  if (card) card.classList.add('hidden');

  if (destinationMarker) {
    map.removeLayer(destinationMarker);
    destinationMarker = null;
  }
}

window._mapSelectionActive = false;

function activateMapSelection() {
  window._mapSelectionActive = true;
  const banner = document.getElementById('map-select-banner');
  if (banner) {
    banner.classList.remove('hidden');
    initLucide();
  }
  const mapEl = document.getElementById('map');
  if (mapEl) mapEl.style.cursor = 'crosshair';
}

function deactivateMapSelection() {
  window._mapSelectionActive = false;
  const banner = document.getElementById('map-select-banner');
  if (banner) banner.classList.add('hidden');
  const mapEl = document.getElementById('map');
  if (mapEl) mapEl.style.cursor = '';
}

// Wire copy/clear buttons once window loads / setupEventListeners runs
function setupDestinationListeners() {
  const clearBtn = document.getElementById('clear-dest-btn');
  const copyBtn = document.getElementById('copy-coords-btn');
  const activateBtn = document.getElementById('activate-map-click-btn');
  const cancelBtn = document.getElementById('cancel-map-select-btn');

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearDestination();
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window._destLat !== undefined && window._destLng !== undefined) {
        const text = `${window._destLat.toFixed(5)}, ${window._destLng.toFixed(5)}`;
        navigator.clipboard.writeText(text).then(() => {
          const originalHTML = copyBtn.innerHTML;
          copyBtn.innerHTML = '<i data-lucide="check" style="color:#10b981"></i>';
          initLucide();
          setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
            initLucide();
          }, 1500);
        }).catch(err => {
          console.error('Clipboard copy failed:', err);
        });
      }
    });
  }

  if (activateBtn) {
    activateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      activateMapSelection();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deactivateMapSelection();
    });
  }
}


// --------------------------------------------------------------------------
// DATA LOADING AND PARSING (MULTIPLE SOURCES)
// --------------------------------------------------------------------------
async function loadAllAirspaceData() {
  const listContainer = document.getElementById('zones-list');
  try {
    // Load all LFV national datasets (Sweden-wide) + update metadata in parallel
    const [uasRes, ctrRes, rstaRes, arpRes, supRes, metaRes] = await Promise.all([
      fetch('./uas_zones_ED318.json').then(r => r.json()).catch(() => ({ features: [] })),
      fetch('./data/ctrs_sverige.json').then(r => r.json()).catch(() => ({ features: [] })),
      fetch('./data/rsta_sverige.json').then(r => r.json()).catch(() => ({ features: [] })),
      fetch('./data/airports_sverige.json').then(r => r.json()).catch(() => ({ features: [] })),
      fetch('./data/supplements_sverige.json').then(r => r.json()).catch(() => ({ features: [] })),
      fetch('./data/last_update.json').then(r => r.json()).catch(() => null)
    ]);

    // Render last update date
    const lastUpdateDateEl = document.getElementById('last-update-date');
    if (lastUpdateDateEl) {
      if (metaRes && metaRes.lastUpdate) {
        const dateObj = new Date(metaRes.lastUpdate);
        const formattedDate = dateObj.toLocaleDateString('sv-SE', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        lastUpdateDateEl.textContent = formattedDate;
      } else {
        lastUpdateDateEl.textContent = 'Okänt (Ej uppdaterat)';
      }
    }

    // Tag and normalize features from each source
    const uasFeatures = uasRes.features || [];
    uasFeatures.forEach(f => f.properties.source = 'uas');

    const ctrFeatures = ctrRes.features || [];
    ctrFeatures.forEach(f => f.properties.source = 'ctr');

    const rstaFeatures = rstaRes.features || [];
    rstaFeatures.forEach(f => f.properties.source = 'rsta');

    const arpFeatures = arpRes.features || [];
    arpFeatures.forEach(f => f.properties.source = 'arp');

    const supFeatures = supRes.features || [];
    supFeatures.forEach(f => f.properties.source = 'sup');

    // Save as national features
    nationalFeatures = [
      ...uasFeatures,
      ...ctrFeatures,
      ...rstaFeatures,
      ...arpFeatures,
      ...supFeatures
    ];
    
    console.log(`Laddade ${nationalFeatures.length} nationella luftrum och zoner.`);
    
    // Load nature reserves for the selected county
    await loadCountyReserves(selectedRegion);
  } catch (error) {
    console.error('Fel vid laddning av luftrumsdata:', error);
    if (listContainer) {
      listContainer.innerHTML = `<div class="list-placeholder error">Kunde inte läsa in databaser: ${error.message}</div>`;
    }
  }
}

// Fetch and load a county's nature reserves dynamically
async function loadCountyReserves(countyId) {
  const listContainer = document.getElementById('zones-list');
  try {
    const res = await fetch(`./data/reservat_${countyId}.json`);
    if (!res.ok) throw new Error(`Kunde inte läsa data för ${countyId}`);
    
    const geojson = await res.json();
    currentCountyReserves = geojson.features || [];
    currentCountyReserves.forEach(f => f.properties.source = 'nvr');
    
    // Merge national airspaces with current county reserves
    allFeatures = [...nationalFeatures, ...currentCountyReserves];
    console.log(`Region ${countyId} laddad: ${currentCountyReserves.length} naturreservat inlästa.`);
    
    renderZones();
    updateLocalZonesList();
  } catch (error) {
    console.error(`Fel vid inläsning av länets reservat (${countyId}):`, error);
    // Even if reserves fail, render the rest of the airspace
    allFeatures = [...nationalFeatures];
    renderZones();
    updateLocalZonesList();
  }
}

// Render zones based on active filters
function renderZones() {
  // Clear existing layers
  zoneLayers.forEach(layer => map.removeLayer(layer));
  zoneLayers = [];

  allFeatures.forEach(feature => {
    const type = feature.properties.type;
    const source = feature.properties.source;
    
    // Check filter
    if (source === 'nvr') {
      if (!activeFilters.nvr) return;
    } else {
      if (!activeFilters[type]) return;
    }

    // Custom rendering for Airports (ARP) -> Marker + 5 km warning boundary circle (RED)
    if (source === 'arp') {
      const coordinates = feature.geometry.coordinates; // [lng, lat]
      const airportLatLng = [coordinates[1], coordinates[0]];

      // 1. Create airport DivIcon marker (Red bubble)
      const planeIcon = L.divIcon({
        className: 'airport-icon-container',
        html: '<div style="background: rgba(239, 68, 68, 0.2); border: 2px solid #ef4444; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 6px rgba(239, 68, 68, 0.4);"><i data-lucide="plane" style="width: 12px; height: 12px; color: #ef4444;"></i></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      const marker = L.marker(airportLatLng, { icon: planeIcon });

      // 2. Create 5km airport protection area circle (Red)
      const warningCircle = L.circle(airportLatLng, {
        radius: 5000,
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 0.04,
        weight: 1.5,
        dashArray: '5, 5'
      });

      const popupContent = createPopupContent(feature);
      
      const setupClick = (layer) => {
        layer.on('click', (e) => {
          if (window._mapSelectionActive) {
            setDestination(e.latlng.lat, e.latlng.lng);
            deactivateMapSelection();
          } else {
            if (window.innerWidth <= 768) {
              L.DomEvent.stopPropagation(e);
              showMobileDetail(feature);
            } else {
              layer.bindPopup(popupContent, { maxWidth: 320 }).openPopup();
            }
          }
        });
      };

      setupClick(marker);
      setupClick(warningCircle);

      marker.addTo(map);
      warningCircle.addTo(map);
      
      marker.feature = feature;
      warningCircle.feature = feature;

      zoneLayers.push(marker);
      zoneLayers.push(warningCircle);
      return;
    }

    const layerStyle = getZoneStyle(type, source);
    let mapLayer;

    if (feature.geometry.type === 'Point' && feature.geometry.extent && feature.geometry.extent.subType === 'Circle') {
      // Circle geometry
      const coordinates = feature.geometry.coordinates; // [lng, lat]
      const radius = feature.geometry.extent.radius; // in meters
      mapLayer = L.circle([coordinates[1], coordinates[0]], {
        radius: radius,
        ...layerStyle
      });
    } else if (feature.geometry.type === 'Polygon') {
      // Polygon geometry
      const latLngs = feature.geometry.coordinates.map(ring => 
        ring.map(coord => [coord[1], coord[0]])
      );
      mapLayer = L.polygon(latLngs, layerStyle);
    } else if (feature.geometry.type === 'MultiPolygon') {
      // MultiPolygon geometry
      const latLngs = feature.geometry.coordinates.map(poly => 
        poly.map(ring => ring.map(coord => [coord[1], coord[0]]))
      );
      mapLayer = L.polygon(latLngs, layerStyle);
    }

    if (mapLayer) {
      const popupContent = createPopupContent(feature);
      
      mapLayer.on('click', (e) => {
        if (window._mapSelectionActive) {
          setDestination(e.latlng.lat, e.latlng.lng);
          deactivateMapSelection();
        } else {
          if (window.innerWidth <= 768) {
            L.DomEvent.stopPropagation(e);
            showMobileDetail(feature);
          } else {
            mapLayer.bindPopup(popupContent, { maxWidth: 320 }).openPopup();
          }
        }
      });

      mapLayer.addTo(map);
      mapLayer.feature = feature;
      zoneLayers.push(mapLayer);
    }
  });

  // Re-run Lucide in case new plane icons were generated
  setTimeout(initLucide, 50);
}

// Get styling based on zone type and source database
function getZoneStyle(type, source) {
  let color = '#64748b'; // default
  let fillOpacity = 0.3;
  let weight = 2;
  let dashArray = null;

  if (source === 'nvr') {
    // Nature reserves (Naturreservat)
    color = '#10b981'; // Green
    fillOpacity = 0.15;
    weight = 1.5;
  } else if (source === 'ctr') {
    // CTR airport control zones (ORANGE)
    color = '#f59e0b';
    fillOpacity = 0.1;
    weight = 2;
    dashArray = '6, 6';
  } else if (source === 'rsta') {
    // Restricted areas (R-områden)
    color = '#ef4444'; // Red
    fillOpacity = 0.18;
    weight = 2;
  } else if (source === 'sup') {
    // Temporary supplement restrictions (NOTAMs)
    color = '#ef4444'; // Red
    fillOpacity = 0.22;
    weight = 3;
    dashArray = '5, 5';
  } else {
    // Original UAS zones
    if (type === 'REQ_AUTHORIZATION') {
      color = '#ef4444';
    } else if (type === 'CONDITIONAL') {
      color = '#f59e0b';
    } else if (type === 'NO_RESTRICTION') {
      color = '#06b6d4';
      dashArray = '4, 4';
    }
  }

  return {
    color: color,
    fillColor: color,
    fillOpacity: fillOpacity,
    weight: weight,
    dashArray: dashArray
  };
}

// Helper to find localized name, supporting normalized properties
function getFeatureName(feature) {
  if (feature.properties.source !== 'uas' && typeof feature.properties.name === 'string') {
    return feature.properties.name;
  }
  const nameArr = feature.properties.name || [];
  const seName = nameArr.find(n => n.lang === 'se-SE');
  if (seName) return seName.text;
  const enName = nameArr.find(n => n.lang === 'en-GB');
  if (enName) return enName.text;
  return nameArr[0]?.text || 'Namnlös zon';
}

// Create popup HTML structure
function createPopupContent(feature) {
  const name = getFeatureName(feature);
  const type = feature.properties.type;
  const source = feature.properties.source;
  
  let typeText = 'Okänd';
  let tagClass = '';
  if (type === 'REQ_AUTHORIZATION') {
    typeText = 'Kräver tillstånd';
    tagClass = 'tag-auth';
  } else if (type === 'CONDITIONAL') {
    typeText = 'Särskilda villkor';
    tagClass = 'tag-cond';
  } else if (type === 'NO_RESTRICTION') {
    typeText = 'Informatorisk zon';
    tagClass = 'tag-info';
  }

  // 1. LFV CTR Airspace popup content (includes smart 5km text rules)
  if (source === 'ctr') {
    const code = feature.properties.POSITIONINDICATOR || '';
    const layer = feature.properties.layer || {};
    return `
      <div class="popup-zone-details">
        <span class="popup-zone-tag tag-cond" style="background: rgba(245, 158, 11, 0.2); color: #fde047;">Kontrollzon (CTR)</span>
        <h4>${name}</h4>
        <p><strong>Flygplatskod:</strong> ${code}</p>
        <p><strong>Höjdgräns:</strong> ${layer.lower} - ${layer.upper} ${layer.uom || 'ft'} ${layer.lowerReference || 'AMSL'}</p>
        
        <p style="margin-top: 6px; font-weight: 600; color: var(--primary);">Drönarregler i CTR (TSFS 2020:87):</p>
        <p style="margin-bottom: 4px;">❌ <strong>Inom 5 km</strong> från banorna: Kräver ALLTID godkännande från flygtrafikledningen (ATC).</p>
        <p style="margin-bottom: 8px;">✅ <strong>Mer än 5 km</strong> från banorna: Drönare (&lt;7 kg, &lt;90 km/h) får flyga utan tillstånd upp till <strong>50 m höjd (AGL)</strong>.</p>
        
        <div class="popup-zone-contact">
          <div class="popup-zone-contact-title">Källmaterial</div>
          <p>Luftfartsverket (LFV) AIP & Transportstyrelsen</p>
          <a href="https://aro.lfv.se" target="_blank" rel="noopener" class="contact-link"><i data-lucide="external-link"></i> LFV AROWeb</a>
        </div>
      </div>
    `;
  }

  // 2. LFV RSTA Restricted Area (R-område) popup content
  if (source === 'rsta') {
    const loc = feature.properties.LOCATION || '';
    const layer = feature.properties.layer || {};
    const comment = feature.properties.comment || 'Restriktionsområde för flyg.';
    return `
      <div class="popup-zone-details">
        <span class="popup-zone-tag tag-auth">Restriktionsområde</span>
        <h4>${name}</h4>
        <p><strong>Plats:</strong> ${loc}</p>
        <p><strong>Höjdgräns:</strong> ${layer.lower} - ${layer.upper} ${layer.uom || 'ft'}</p>
        <p><strong>Beskrivning:</strong> ${comment}</p>
        <div class="popup-zone-contact">
          <div class="popup-zone-contact-title">Ansvarig myndighet</div>
          <p>Transportstyrelsen / LFV</p>
          <a href="https://aro.lfv.se" target="_blank" rel="noopener" class="contact-link"><i data-lucide="external-link"></i> LFV AROWeb</a>
        </div>
      </div>
    `;
  }

  // 3. LFV ARP Airport marker popup content
  if (source === 'arp') {
    const code = feature.properties.indicator || '';
    return `
      <div class="popup-zone-details">
        <span class="popup-zone-tag tag-auth">Flygplats / Heliport</span>
        <h4>${name}</h4>
        ${code ? `<p><strong>Flygplatskod:</strong> ${code}</p>` : ''}
        <p><strong>Skyddszon:</strong> 5 km radie (röd streckad linje)</p>
        <p><strong>Regler:</strong> Flygning inom 5 km kräver tillstånd, alternativt är maxhöjden begränsad till 50 m AGL (10 m för heliportar) om ingen CTR är aktiv.</p>
      </div>
    `;
  }

  // 4. LFV SUP Temporary restricted area (NOTAM) popup content
  if (source === 'sup') {
    const from = feature.properties.validFrom ? new Date(feature.properties.validFrom).toLocaleDateString('sv-SE') : 'Okänt';
    const to = feature.properties.validTo ? new Date(feature.properties.validTo).toLocaleDateString('sv-SE') : 'Okänt';
    const comment = feature.properties.comment || '';
    const url = feature.properties.URL || '';
    const layer = feature.properties.layer || {};
    return `
      <div class="popup-zone-details">
        <span class="popup-zone-tag tag-auth">Tillfällig restriktion (NOTAM/SUP)</span>
        <h4>${name}</h4>
        <p><strong>Giltig från:</strong> ${from}</p>
        <p><strong>Giltig till:</strong> ${to}</p>
        <p><strong>Höjdgräns:</strong> ${layer.lower} - ${layer.upper} ${layer.uom || ''}</p>
        <p><strong>Information:</strong> ${comment}</p>
        ${url ? `
        <div class="popup-zone-contact">
          <a href="${url}" target="_blank" rel="noopener" class="contact-link"><i data-lucide="external-link"></i> Officiellt AIP-tillägg</a>
        </div>` : ''}
      </div>
    `;
  }

  // 5. Naturvårdsverket Nature Reserve (Naturreservat) popup content
  if (source === 'nvr') {
    const area = feature.properties.areaHa ? `${feature.properties.areaHa.toFixed(1)} ha` : 'Okänd';
    return `
      <div class="popup-zone-details">
        <span class="popup-zone-tag tag-cond">Naturreservat</span>
        <h4>${name}</h4>
        <p><strong>Skyddsform:</strong> Naturreservat</p>
        <p><strong>Areal:</strong> ${area}</p>
        <p><strong>Regler:</strong> Fågelskyddsområden och naturreservat har ofta lokala föreskrifter. Det är ofta förbjudet att starta/landa med drönare eller flyga lågt för att inte störa djurliv och fåglar.</p>
        <div class="popup-zone-contact">
          <div class="popup-zone-contact-title">Förvaltare</div>
          <p>Länsstyrelsen i länet / Naturvårdsverket</p>
          <a href="https://skyddadnatur.naturvardsverket.se" target="_blank" rel="noopener" class="contact-link"><i data-lucide="map"></i> Kartverktyget Skyddad Natur</a>
        </div>
      </div>
    `;
  }

  // 6. Original UAS geographical zones
  const layer = feature.geometry.layer || {};
  const heightText = `${layer.lower} - ${layer.upper} ${layer.uom || 'm'} ${layer.lowerReference || 'AGL'}`;

  const reasonList = feature.properties.reason || [];
  const reasonText = reasonList.map(r => {
    if (r === 'SENSITIVE') return 'Miljö/Känsligt område';
    if (r === 'AIR_TRAFFIC') return 'Flygtrafiksäkerhet';
    if (r === 'PRIVACY') return 'Privatliv';
    if (r === 'OTHER') return 'Övrigt';
    return r;
  }).join(', ');

  let authHtml = '';
  if (feature.properties.zoneAuthority && feature.properties.zoneAuthority.length > 0) {
    const auth = feature.properties.zoneAuthority[0];
    const authName = auth.name?.find(n => n.lang === 'se-SE')?.text || auth.name?.[0]?.text || '';
    const phone = auth.phone?.[0]?.text || '';
    const email = auth.email?.[0]?.text || '';
    const site = auth.siteURL?.[0]?.text || '';

    authHtml = `
      <div class="popup-zone-contact">
        <div class="popup-zone-contact-title">Ansvarig myndighet</div>
        <p><strong>${authName}</strong></p>
        ${phone ? `<a href="tel:${phone}" class="contact-link"><i data-lucide="phone"></i> ${phone}</a>` : ''}
        ${email ? `<a href="mailto:${email}" class="contact-link"><i data-lucide="mail"></i> ${email}</a>` : ''}
        ${site ? `<a href="${site}" target="_blank" rel="noopener" class="contact-link"><i data-lucide="external-link"></i> Webbplats</a>` : ''}
      </div>
    `;
  }

  let msgHtml = '';
  if (feature.properties.message && feature.properties.message.length > 0) {
    const msg = feature.properties.message.find(m => m.lang === 'se-SE')?.text || feature.properties.message[0]?.text || '';
    msgHtml = `<p><strong>Information:</strong> ${msg}</p>`;
  }

  const html = `
    <div class="popup-zone-details">
      <span class="popup-zone-tag ${tagClass}">${typeText}</span>
      <h4>${name}</h4>
      <p><strong>Identifierare:</strong> ${feature.properties.identifier}</p>
      <p><strong>Höjdgränser:</strong> ${heightText}</p>
      ${reasonText ? `<p><strong>Orsak:</strong> ${reasonText}</p>` : ''}
      ${msgHtml}
      ${authHtml}
    </div>
  `;

  setTimeout(initLucide, 50);
  return html;
}

// Mobile Slide-up view
function showMobileDetail(feature) {
  const body = document.getElementById('detail-body');
  const overlay = document.getElementById('detail-overlay');
  if (body && overlay) {
    body.innerHTML = createPopupContent(feature);
    overlay.classList.remove('hidden');
    initLucide();
  }
}

// --------------------------------------------------------------------------
// GEOLOCATION LOGIC
// --------------------------------------------------------------------------
function setupGeolocation() {
  const locateBtn = document.getElementById('locate-btn');
  if (!locateBtn) return;

  let watchId   = null;
  let firstLock = false;

  // ── Shared handler: runs on every position fix (quick or continuous) ──────
  function onPositionReceived(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    userLocation = L.latLng(lat, lng);
    updateGeofenceCircle();

    window._lastKnownLat = lat;
    window._lastKnownLng = lng;

    fetchSMHIWeather(lat, lng);

    // Update distance to planned destination
    if (window._destLat !== undefined && window._destLng !== undefined) {
      const dist = userLocation.distanceTo(L.latLng(window._destLat, window._destLng));
      const distRow = document.getElementById('dest-distance-row');
      const distVal = document.getElementById('dest-distance-val');
      if (distRow && distVal) {
        distRow.classList.remove('hidden');
        distVal.innerText = dist < 1000 ? `${Math.round(dist)} m` : `${(dist/1000).toFixed(2)} km`;
      }
    }

    // Auto-detect county
    const detectedCounty = detectCountyFromLatLng(lat, lng);
    if (detectedCounty && detectedCounty !== selectedRegion) {
      selectedRegion = detectedCounty;
      localStorage.setItem('selectedRegion', detectedCounty);
      const regionSelector = document.getElementById('region-selector');
      if (regionSelector) regionSelector.value = detectedCounty;
      loadCountyReserves(detectedCounty);
    }

    // Button UI
    locateBtn.disabled = false;
    locateBtn.querySelector('span').innerText = 'GPS positionerad';
    locateBtn.classList.add('active');

    // FAB active state
    document.getElementById('map-locate-btn')?.classList.add('gps-active');

    // Draw or move marker
    if (userMarker) {
      userMarker.setLatLng(userLocation);
    } else {
      const userIcon = L.divIcon({
        className: 'user-location-marker-container',
        html: `<div class="ulm-wrapper">
                 <div class="ulm-ring"></div>
                 <div class="ulm-core"></div>
                 <div class="ulm-arm ulm-arm-n"></div>
                 <div class="ulm-arm ulm-arm-s"></div>
                 <div class="ulm-arm ulm-arm-w"></div>
                 <div class="ulm-arm ulm-arm-e"></div>
               </div>`,
        iconSize:   [48, 48],
        iconAnchor: [24, 24]
      });
      userMarker = L.marker(userLocation, { icon: userIcon }).addTo(map);
    }

    // Center map on first lock
    if (!firstLock) {
      firstLock = true;
      map.setView(userLocation, 14);
    }

    checkUserFlightStatus(userLocation);
    updateLocalZonesList();
    checkGeofenceAlert(userLocation);
  }

  // ── Start continuous watchPosition ────────────────────────────────────────
  function startWatch(highAccuracy) {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }

    watchId = navigator.geolocation.watchPosition(
      onPositionReceived,
      (error) => {
        console.warn('GPS-fel (kod ' + error.code + '):', error.message);
        locateBtn.disabled = false;

        if (error.code === 1) {
          locateBtn.querySelector('span').innerText = 'GPS-åtkomst nekad';
          locateBtn.classList.remove('active');
          if (!locateBtn.dataset.permDeniedAlerted) {
            locateBtn.dataset.permDeniedAlerted = 'true';
            alert('Tillåt platsåtkomst i webbläsaren/inställningar för att använda GPS.');
          }
        } else if (error.code === 2) {
          if (highAccuracy) {
            locateBtn.querySelector('span').innerText = 'Byter till nätverks-GPS...';
            startWatch(false);
          } else {
            locateBtn.querySelector('span').innerText = 'Position ej tillgänglig';
          }
        } else if (error.code === 3) {
          locateBtn.querySelector('span').innerText = 'GPS-signal svag, söker...';
        } else {
          locateBtn.querySelector('span').innerText = 'Hitta min position (GPS)';
        }
      },
      { enableHighAccuracy: highAccuracy, timeout: highAccuracy ? 12000 : 20000, maximumAge: 3000 }
    );
  }

  locateBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('Din webbläsare stöder inte GPS-positionering.');
      return;
    }

    // Already watching — just re-center
    if (watchId !== null && userLocation) {
      map.setView(userLocation, 14);
      return;
    }

    locateBtn.disabled = true;
    locateBtn.querySelector('span').innerText = 'Söker position...';
    firstLock = false;

    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Step 1: Fast low-accuracy fix (works indoors, on desktop, via WiFi/IP)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onPositionReceived(pos);   // immediate UI update
        // Step 2: Start continuous low-accuracy watch
        startWatch(false);
        // Step 3: On mobile, upgrade to high-accuracy GPS after 2s
        if (isMobile) {
          setTimeout(() => startWatch(true), 2000);
        }
      },
      () => {
        // Low-accuracy failed — try high accuracy directly (mobile outdoors)
        startWatch(isMobile ? true : false);
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  });
}

// Check flight status for given LatLng (includes smart 5km airport warning distance in CTRs)
function checkUserFlightStatus(latLng) {
  const statusCard = document.getElementById('status-card');
  const statusTitle = document.getElementById('status-title');
  const statusDesc = document.getElementById('status-desc');
  
  if (!statusCard || !statusTitle || !statusDesc) return;

  let insideZones = [];

  // Check each zone feature
  allFeatures.forEach(feature => {
    if (isPointInsideFeature(latLng, feature)) {
      insideZones.push(feature);
    }
  });

  // Separate zones for custom rule priority
  let insideCTR = insideZones.filter(z => z.properties.source === 'ctr');
  let insideOtherAuth = insideZones.filter(z => z.properties.type === 'REQ_AUTHORIZATION' && z.properties.source !== 'ctr');
  let insideCond = insideZones.filter(z => z.properties.type === 'CONDITIONAL');
  let insideInfo = insideZones.filter(z => z.properties.type === 'NO_RESTRICTION');

  statusCard.className = 'status-card'; // reset classes

  if (insideZones.length === 0) {
    statusCard.classList.add('status-safe');
    statusTitle.innerText = 'OK att flyga';
    statusDesc.innerHTML = 'Inga geografiska restriktioner funna vid din position. Standardregler (max 120m, synhåll, ej över folksamlingar) gäller.';
  } else if (insideOtherAuth.length > 0) {
    // Restricted area or temporary flight ban (NOTAM/SUP)
    statusCard.classList.add('status-restricted');
    statusTitle.innerText = 'Flygning förbjuden / Kräver tillstånd';
    const zoneNames = insideOtherAuth.map(z => getFeatureName(z)).join(', ');
    statusDesc.innerHTML = `Du befinner dig inom restriktionszon: <strong>${zoneNames}</strong>. Du MÅSTE ha tillstånd från ansvarig myndighet innan flygning!`;
  } else if (insideCTR.length > 0) {
    // Inside CTR: Calculate distance to the nearest airport center (ARP)
    const airports = allFeatures.filter(z => z.properties.source === 'arp');
    let nearestAirport = null;
    let minAirportDist = Infinity;
    
    airports.forEach(airport => {
      const airportLatLng = L.latLng(airport.geometry.coordinates[1], airport.geometry.coordinates[0]);
      const dist = latLng.distanceTo(airportLatLng);
      if (dist < minAirportDist) {
        minAirportDist = dist;
        nearestAirport = airport;
      }
    });

    const ctrNames = insideCTR.map(z => getFeatureName(z)).join(', ');

    if (minAirportDist <= 5000) {
      // Within 5km of the airport in CTR -> Restricted!
      statusCard.classList.add('status-restricted');
      statusTitle.innerText = 'Kräver tillstånd (Inom 5 km från flygplats)';
      statusDesc.innerHTML = `Du befinner dig i <strong>${ctrNames}</strong> och är endast ${(minAirportDist/1000).toFixed(2)} km från flygplatsens banor. Flygning kräver särskilt tillstånd från flygtrafikledningen (ATC).`;
    } else {
      // Outside 5km in CTR -> Warning/Conditional (allows flying up to 50m AGL under TSFS 2020:87)
      statusCard.classList.add('status-warning'); // Amber color card
      statusTitle.innerText = 'CTR Villkor: Max 50 m höjd';
      statusDesc.innerHTML = `Du befinner dig i <strong>${ctrNames}</strong> och är ${(minAirportDist/1000).toFixed(1)} km från banorna. Du får flyga upp till <strong>50 meter över marken (AGL)</strong> utan godkännande, förutsatt att drönaren väger &lt; 7 kg och hastighet &lt; 90 km/h.`;
    }
  } else if (insideCond.length > 0) {
    // Inside Nature Reserve or Hospital zones
    statusCard.classList.add('status-warning');
    statusTitle.innerText = 'Särskilda villkor gäller';
    const zoneNames = insideCond.map(z => getFeatureName(z)).join(', ');
    statusDesc.innerHTML = `Du befinner dig inom zon med villkor: <strong>${zoneNames}</strong>. Kontrollera villkor (t.ex. naturreservat flygförbud, sjukhusområde) innan flygning.`;
  } else if (insideInfo.length > 0) {
    statusCard.classList.add('status-warning');
    statusTitle.innerText = 'Informationsområde';
    const zoneNames = insideInfo.map(z => getFeatureName(z)).join(', ');
    statusDesc.innerHTML = `Du befinner dig i ett lågflyg- eller konsultationsområde: <strong>${zoneNames}</strong>. Var extra uppmärksam på flygtrafik.`;
  }
}

// Ray casting and geometry calculations for zone intersection, with MultiPolygon support
function isPointInsideFeature(latLng, feature) {
  const geom = feature.geometry;
  
  if (geom.type === 'Point' && geom.extent && geom.extent.subType === 'Circle') {
    // Circle: distance from center must be <= radius
    const center = L.latLng(geom.coordinates[1], geom.coordinates[0]);
    const dist = latLng.distanceTo(center); // distance in meters
    return dist <= geom.extent.radius;
  }

  // Draw 5km warning zones around Airport points
  if (geom.type === 'Point' && feature.properties.source === 'arp') {
    const center = L.latLng(geom.coordinates[1], geom.coordinates[0]);
    const dist = latLng.distanceTo(center);
    return dist <= 5000; // 5 km warning boundary
  }
  
  if (geom.type === 'Polygon') {
    return isPointInPolygonCoords(latLng, geom.coordinates);
  }

  if (geom.type === 'MultiPolygon') {
    return geom.coordinates.some(polyCoords => isPointInPolygonCoords(latLng, polyCoords));
  }
  
  return false;
}

function isRedZone(type, source) {
  // Only hard-restricted zones block flight point placement.
  // 'arp' (airport warning circle) and 'ctr' (orange CTR) are NOT hard blocks.
  if (source === 'rsta') return true;  // R-områden (restricted areas)
  if (source === 'sup')  return true;  // Temporary NOTAM restrictions
  if (type === 'REQ_AUTHORIZATION' && source !== 'arp' && source !== 'ctr') return true;
  return false;
}

function isCoordinateInRedZone(latLng) {
  return allFeatures.some(feature => {
    const type = feature.properties.type;
    const source = feature.properties.source;
    if (!isRedZone(type, source)) return false;

    // Check if filter is active for this zone
    if (source !== 'nvr' && !activeFilters[type]) return false;

    // Handle airport warning area circle (RED)
    if (source === 'arp') {
      const coords = feature.geometry.coordinates;
      const dist = latLng.distanceTo(L.latLng(coords[1], coords[0]));
      return dist <= 5000; // 5km circle
    }

    return isPointInsideFeature(latLng, feature);
  });
}

// Helper: Point in Polygon ring verification
function isPointInPolygonCoords(latLng, polyCoords) {
  const outerRing = polyCoords[0]; // array of [lng, lat]
  let inside = false;
  const x = latLng.lng;
  const y = latLng.lat;
  
  for (let i = 0, j = outerRing.length - 1; i < outerRing.length; j = i++) {
    const xi = outerRing[i][0];
    const yi = outerRing[i][1];
    const xj = outerRing[j][0];
    const yj = outerRing[j][1];
    
    const intersect = ((yi > y) !== (yj > y)) && 
                      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  
  if (inside) {
    for (let k = 1; k < polyCoords.length; k++) {
      const hole = polyCoords[k];
      let insideHole = false;
      for (let i = 0, j = hole.length - 1; i < hole.length; j = i++) {
        const xi = hole[i][0];
        const yi = hole[i][1];
        const xj = hole[j][0];
        const yj = hole[j][1];
        
        const intersect = ((yi > y) !== (yj > y)) && 
                          (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) insideHole = !insideHole;
      }
      if (insideHole) return false;
    }
    return true;
  }
  return false;
}

// Distance from user point to feature (polygon edges, circle boundaries, support MultiPolygon)
function calculateDistanceToFeature(latLng, feature) {
  const geom = feature.geometry;

  if (geom.type === 'Point' && geom.extent && geom.extent.subType === 'Circle') {
    const center = L.latLng(geom.coordinates[1], geom.coordinates[0]);
    const dist = latLng.distanceTo(center);
    return Math.max(0, dist - geom.extent.radius);
  }

  if (geom.type === 'Point' && feature.properties.source === 'arp') {
    const center = L.latLng(geom.coordinates[1], geom.coordinates[0]);
    const dist = latLng.distanceTo(center);
    return Math.max(0, dist - 5000); // Distance to 5km airport zone
  }

  if (geom.type === 'Polygon') {
    if (isPointInsideFeature(latLng, feature)) return 0;
    return getMinDistanceToPolygonCoords(latLng, geom.coordinates);
  }

  if (geom.type === 'MultiPolygon') {
    if (isPointInsideFeature(latLng, feature)) return 0;
    let minD = Infinity;
    geom.coordinates.forEach(polyCoords => {
      const d = getMinDistanceToPolygonCoords(latLng, polyCoords);
      if (d < minD) minD = d;
    });
    return minD;
  }

  return null;
}

// Helper: Min distance to outer boundary segments
function getMinDistanceToPolygonCoords(latLng, polyCoords) {
  const outerRing = polyCoords[0];
  let minDist = Infinity;

  for (let i = 0; i < outerRing.length - 1; i++) {
    const p1 = L.latLng(outerRing[i][1], outerRing[i][0]);
    const p2 = L.latLng(outerRing[i+1][1], outerRing[i+1][0]);
    const d = getDistanceToSegment(latLng, p1, p2);
    if (d < minDist) minDist = d;
  }

  return minDist;
}

// Math distance from point P to line segment AB
function getDistanceToSegment(p, a, b) {
  const avgLat = (p.lat + a.lat + b.lat) / 3;
  const kx = 111320 * Math.cos(avgLat * Math.PI / 180);
  const ky = 111000;

  const px = p.lng * kx;
  const py = p.lat * ky;
  const ax = a.lng * kx;
  const ay = a.lat * ky;
  const bx = b.lng * kx;
  const by = b.lat * ky;

  const l2 = (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
  if (l2 === 0) return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));

  let t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2;
  t = Math.max(0, Math.min(1, t));

  const dx = px - (ax + t * (bx - ax));
  const dy = py - (ay + t * (by - ay));

  return Math.sqrt(dx * dx + dy * dy);
}

// --------------------------------------------------------------------------
// SEARCH AND GEOCONVERSION (Nominatim OSM)
// --------------------------------------------------------------------------
async function performSearch(query) {
  const resultsContainer = document.getElementById('search-results');
  if (!resultsContainer) return;

  // Parse decimal coordinates if possible (e.g. "55.90, 13.50" or "55.90 13.50")
  const coordRegex = /^\s*([+-]?\d+(?:\.\d+)?)\s*[\s,;]\s*([+-]?\d+(?:\.\d+)?)\s*$/;
  const match = query.match(coordRegex);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      map.setView([lat, lng], 14);
      setDestination(lat, lng);
      resultsContainer.innerHTML = '';
      resultsContainer.classList.add('hidden');
      return;
    }
  }

  if (!query || query.trim().length < 3) {
    resultsContainer.innerHTML = '';
    resultsContainer.classList.add('hidden');
    return;
  }

  try {
    resultsContainer.innerHTML = '<div class="search-result-item">Söker...</div>';
    resultsContainer.classList.remove('hidden');

    const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=se&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8'
      }
    });

    if (!response.ok) throw new Error('Sökningen misslyckades');
    const data = await response.json();

    if (data.length === 0) {
      resultsContainer.innerHTML = '<div class="search-result-item">Inga platser funna</div>';
      return;
    }

    resultsContainer.innerHTML = '';
    data.slice(0, 5).forEach(item => {
      const el = document.createElement('div');
      el.className = 'search-result-item';
      
      const cleanName = item.display_name.split(',').slice(0, 3).join(',');
      el.innerText = cleanName;
      
      el.addEventListener('click', () => {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        map.setView([lat, lng], 13);
        
        L.popup()
          .setLatLng([lat, lng])
          .setContent(`<strong>Sökt plats:</strong><br>${cleanName}`)
          .openOn(map);

        resultsContainer.innerHTML = '';
        resultsContainer.classList.add('hidden');
        document.getElementById('search-input').value = cleanName;
      });
      resultsContainer.appendChild(el);
    });
  } catch (error) {
    console.error('Sökfel:', error);
    resultsContainer.innerHTML = `<div class="search-result-item error">Fel: ${error.message}</div>`;
  }
}

// --------------------------------------------------------------------------
// SIDEBAR ZONES LISTING
// --------------------------------------------------------------------------
function updateLocalZonesList() {
  const listContainer = document.getElementById('zones-list');
  const countBadge = document.getElementById('zone-count-badge');
  if (!listContainer) return;

  const bounds = map.getBounds();
  let visibleZones = [];

  zoneLayers.forEach(layer => {
    const feat = layer.feature;
    if (!feat) return;

    let isVisible = false;
    
    if (feat.geometry.type === 'Point') {
      const latLng = L.latLng(feat.geometry.coordinates[1], feat.geometry.coordinates[0]);
      isVisible = bounds.contains(latLng);
    } else if (feat.geometry.type === 'Polygon' || feat.geometry.type === 'MultiPolygon') {
      isVisible = bounds.intersects(layer.getBounds());
    }

    if (isVisible) {
      let distance = null;
      if (userLocation) {
        distance = calculateDistanceToFeature(userLocation, feat);
      }
      visibleZones.push({ feature: feat, layer: layer, distance: distance });
    }
  });

  // Sort visible zones
  if (userLocation) {
    visibleZones.sort((a, b) => a.distance - b.distance);
  } else {
    visibleZones.sort((a, b) => getFeatureName(a.feature).localeCompare(getFeatureName(b.feature), 'sv'));
  }

  // Update count badge
  if (countBadge) {
    countBadge.innerText = visibleZones.length;
  }

  if (visibleZones.length === 0) {
    listContainer.innerHTML = '<div class="list-placeholder">Inga zoner synliga i kartan just nu. Zooma ut eller flytta kartan.</div>';
    return;
  }

  listContainer.innerHTML = '';
  // Limit visible list elements to first 40 to prevent DOM lagging with 500 nature reserves
  visibleZones.slice(0, 40).forEach(item => {
    const feat = item.feature;
    const name = getFeatureName(feat);
    const type = feat.properties.type;
    const source = feat.properties.source;
    
    let typeClass = 'type-info';
    let typeLabel = 'Informatorisk';
    if (type === 'REQ_AUTHORIZATION') {
      typeClass = 'type-auth';
      typeLabel = 'Kräver tillstånd';
    } else if (type === 'CONDITIONAL') {
      typeClass = 'type-cond';
      typeLabel = 'Särskilda villkor';
    }

    const card = document.createElement('div');
    card.className = `zone-item-card ${typeClass}`;
    
    let distHtml = '';
    if (userLocation && item.distance !== null) {
      const distKm = (item.distance / 1000).toFixed(1);
      distHtml = `<span class="zone-distance">${item.distance === 0 ? 'Här' : `${distKm} km bort`}</span>`;
    }

    let sourceLabel = 'UAS';
    if (source === 'ctr') sourceLabel = 'CTR Luftrum';
    if (source === 'rsta') sourceLabel = 'R-område';
    if (source === 'arp') sourceLabel = 'Flygplats';
    if (source === 'sup') sourceLabel = 'NOTAM';
    if (source === 'nvr') sourceLabel = 'Naturreservat';

    card.innerHTML = `
      <div class="zone-item-title">${name}</div>
      <div class="zone-item-meta">
        <span>${sourceLabel} | ${typeLabel}</span>
        ${distHtml}
      </div>
    `;

    card.addEventListener('click', () => {
      if (feat.geometry.type === 'Point') {
        map.setView([feat.geometry.coordinates[1], feat.geometry.coordinates[0]], 12);
      } else {
        map.fitBounds(item.layer.getBounds(), { padding: [50, 50] });
      }

      if (window.innerWidth <= 768) {
        showMobileDetail(feat);
      } else {
        item.layer.openPopup();
      }
    });

    listContainer.appendChild(card);
  });

  if (visibleZones.length > 40) {
    const moreCard = document.createElement('div');
    moreCard.className = 'list-placeholder';
    moreCard.style.padding = '8px';
    moreCard.innerText = `...och ${visibleZones.length - 40} fler zoner. Zooma in för att begränsa sökningen.`;
    listContainer.appendChild(moreCard);
  }
}

// --------------------------------------------------------------------------
// GARMIN GPX EXPORT LOGIC
// --------------------------------------------------------------------------

// Helper to escape XML special characters
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.toString().replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

// Generate circular track points (approximation for LCircle)
function getCirclePoints(center, radiusMeters, numPoints = 32) {
  const points = [];
  const lat = center.lat;
  const lng = center.lng;
  const R = 6378137;

  for (let i = 0; i <= numPoints; i++) {
    const angle = (i * 360 / numPoints) * Math.PI / 180;
    const dLat = (radiusMeters * Math.cos(angle)) / R;
    const dLng = (radiusMeters * Math.sin(angle)) / (R * Math.cos(lat * Math.PI / 180));
    
    const ptLat = lat + dLat * 180 / Math.PI;
    const ptLng = lng + dLng * 180 / Math.PI;
    points.push({ lat: ptLat, lng: ptLng });
  }
  return points;
}

// Build and trigger download of GPX file
function exportToGpx() {
  const filteredFeatures = allFeatures.filter(feature => {
    if (feature.properties.source === 'nvr') {
      return activeFilters.nvr;
    }
    return activeFilters[feature.properties.type];
  });

  if (filteredFeatures.length === 0) {
    alert('Inga zoner är aktiva i filtret just nu.');
    return;
  }

  let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n';
  gpx += '<gpx version="1.1" creator="Svensk Dronarkarta" \n';
  gpx += '  xmlns="http://www.topografix.com/GPX/1/1" \n';
  gpx += '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" \n';
  gpx += '  xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3" \n';
  gpx += '  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n';
  
  gpx += '  <metadata>\n';
  gpx += '    <name>Dronarzoner Sverige</name>\n';
  gpx += '    <desc>UAS-zoner, CTR, R-omraden och Naturreservat exporterade fran Svensk Dronarkarta</desc>\n';
  gpx += `    <time>${new Date().toISOString()}</time>\n`;
  gpx += '  </metadata>\n';

  // Planned flight point — exported as first waypoint if set
  if (window._destLat !== undefined && window._destLng !== undefined) {
    const destLat = window._destLat.toFixed(6);
    const destLng = window._destLng.toFixed(6);
    gpx += `  <wpt lat="${destLat}" lon="${destLng}">\n`;
    gpx += `    <name>Planerad flygpunkt</name>\n`;
    gpx += `    <desc>Mitt planerade flygomrade - exporterat fran Svensk Dronarkarta</desc>\n`;
    gpx += `    <sym>Flag, Red</sym>\n`;
    gpx += `  </wpt>\n`;
  }

  filteredFeatures.forEach(feature => {
    const name = getFeatureName(feature);
    const type = feature.properties.type;
    const source = feature.properties.source;
    
    let centerLat, centerLng;
    let points = [];
    let desc = `Kalla: ${source.toUpperCase()} | Typ: ${type}`;

    if (source === 'ctr') {
      const code = feature.properties.POSITIONINDICATOR || '';
      const layer = feature.properties.layer || {};
      desc = `CTR Luftrum | Flygplatskod: ${code} | Hojd: ${layer.lower}-${layer.upper} ft AMSL`;
    } else if (source === 'rsta') {
      const loc = feature.properties.LOCATION || '';
      const layer = feature.properties.layer || {};
      desc = `Restriktionsomrade | Plats: ${loc} | Hojd: ${layer.lower}-${layer.upper} ft`;
    } else if (source === 'arp') {
      const code = feature.properties.indicator || '';
      desc = `Flygplats/Heliport | Kod: ${code} | OBS: 5 km skyddszon`;
    } else if (source === 'sup') {
      desc = `NOTAM/Tillfallig restriktion | Info: ${feature.properties.comment || ''}`;
    } else if (source === 'nvr') {
      desc = `Naturreservat | Skydd: Ofta flygforbud eller laghojdsforbud.`;
    }

    // Coordinates parsing depending on geometry type
    if (feature.geometry.type === 'Point') {
      centerLng = feature.geometry.coordinates[0];
      centerLat = feature.geometry.coordinates[1];
      
      if (feature.geometry.extent && feature.geometry.extent.subType === 'Circle') {
        points = getCirclePoints({ lat: centerLat, lng: centerLng }, feature.geometry.extent.radius);
      } else if (source === 'arp') {
        // Warning circle around airports
        points = getCirclePoints({ lat: centerLat, lng: centerLng }, 5000);
      }
    } else if (feature.geometry.type === 'Polygon') {
      const outerRing = feature.geometry.coordinates[0];
      points = outerRing.map(c => ({ lat: c[1], lng: c[0] }));
      
      let sumLat = 0, sumLng = 0;
      points.forEach(p => { sumLat += p.lat; sumLng += p.lng; });
      centerLat = sumLat / points.length;
      centerLng = sumLng / points.length;
    } else if (feature.geometry.type === 'MultiPolygon') {
      const firstPoly = feature.geometry.coordinates[0];
      const outerRing = firstPoly[0];
      points = outerRing.map(c => ({ lat: c[1], lng: c[0] }));

      let sumLat = 0, sumLng = 0;
      points.forEach(p => { sumLat += p.lat; sumLng += p.lng; });
      centerLat = sumLat / points.length;
      centerLng = sumLng / points.length;
    }

    // 1. Add Waypoint
    gpx += `  <wpt lat="${centerLat.toFixed(6)}" lon="${centerLng.toFixed(6)}">\n`;
    gpx += `    <name>${escapeXml(name)}</name>\n`;
    gpx += `    <desc>${escapeXml(desc)}</desc>\n`;
    const sym = type === 'REQ_AUTHORIZATION' ? 'Danger Area' : 'Warning';
    gpx += `    <sym>${sym}</sym>\n`;
    gpx += `  </wpt>\n`;

    // 2. Add Track representing boundary
    if (points.length > 0) {
      gpx += `  <trk>\n`;
      gpx += `    <name>${escapeXml(name)} (Grans)</name>\n`;
      gpx += `    <desc>${escapeXml(desc)}</desc>\n`;
      
      // Determine Garmin and HEX style colors based on zone details
      let garminColor = 'Yellow';
      let hexColor = '#f59e0b';
      
      if (source === 'nvr') {
        garminColor = 'DarkGreen';
        hexColor = '#10b981';
      } else if (source === 'ctr') {
        garminColor = 'Yellow'; // Garmin does not have Orange; Yellow is the closest match
        hexColor = '#f59e0b';
      } else if (source === 'rsta' || source === 'sup' || type === 'REQ_AUTHORIZATION') {
        garminColor = 'Red';
        hexColor = '#ef4444';
      } else if (type === 'NO_RESTRICTION') {
        garminColor = 'Cyan';
        hexColor = '#06b6d4';
      }

      gpx += `    <extensions>\n`;
      gpx += `      <gpxx:TrackExtension>\n`;
      gpx += `        <gpxx:DisplayColor>${garminColor}</gpxx:DisplayColor>\n`;
      gpx += `      </gpxx:TrackExtension>\n`;
      gpx += `      <color>${hexColor}</color>\n`;
      gpx += `    </extensions>\n`;

      gpx += `    <trkseg>\n`;
      points.forEach(pt => {
        gpx += `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lng.toFixed(6)}"></trkpt>\n`;
      });
      gpx += `    </trkseg>\n`;
      gpx += `  </trk>\n`;
    }
  });

  gpx += '</gpx>';

  // Trigger file download
  const blob = new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `dronarzoner_sverige_${new Date().toISOString().split('T')[0]}.gpx`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// --------------------------------------------------------------------------
// EVENT LISTENERS AND INTERACTIONS
// --------------------------------------------------------------------------
function setupEventListeners() {
  setupDestinationListeners();

  // ── Mobile Bottom Sheet — 3-snap system ──────────────────────────────────
  const toggleBtn = document.getElementById('toggle-panel-btn');
  const sidebar   = document.getElementById('sidebar');

  function getSnap() {
    if (sidebar.classList.contains('snap-full')) return 'full';
    if (sidebar.classList.contains('snap-half')) return 'half';
    return 'hidden';
  }

  function setSnap(state) {
    sidebar.classList.remove('snap-half', 'snap-full');
    if (state === 'half') sidebar.classList.add('snap-half');
    if (state === 'full') sidebar.classList.add('snap-full');
    // Update toggle icon
    const icon = toggleBtn?.querySelector('i');
    if (icon) {
      icon.setAttribute('data-lucide', state === 'hidden' ? 'menu' : 'chevron-down');
      initLucide();
    }
  }

  if (toggleBtn && sidebar) {
    // Tap: cycle hidden → half → full → hidden
    toggleBtn.addEventListener('click', () => {
      const current = getSnap();
      if      (current === 'hidden') setSnap('half');
      else if (current === 'half')   setSnap('full');
      else                           setSnap('hidden');
    });

    // Swipe on drag handle (::before pseudo — touch on top 40px of sidebar)
    let touchStartY = 0;
    let touchStartX = 0;

    sidebar.addEventListener('touchstart', (e) => {
      touchStartY = e.changedTouches[0].clientY;
      touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });

    sidebar.addEventListener('touchend', (e) => {
      const dy = e.changedTouches[0].clientY - touchStartY;
      const dx = Math.abs(e.changedTouches[0].clientX - touchStartX);
      // Only act on mostly-vertical swipes of >40px starting near the top handle
      if (dx > 40 || Math.abs(dy) < 40) return;
      if (touchStartY > sidebar.getBoundingClientRect().top + 60) return; // only handle area
      const current = getSnap();
      if (dy < 0) {
        // Swipe up → expand
        if (current === 'hidden') setSnap('half');
        else if (current === 'half') setSnap('full');
      } else {
        // Swipe down → collapse
        if (current === 'full') setSnap('half');
        else setSnap('hidden');
      }
    }, { passive: true });
  }

  // ── Floating GPS FAB ─────────────────────────────────────────────────
  const mapLocateBtn = document.getElementById('map-locate-btn');
  const mainLocateBtn = document.getElementById('locate-btn');
  if (mapLocateBtn && mainLocateBtn) {
    mapLocateBtn.addEventListener('click', () => {
      mainLocateBtn.click(); // delegate to the main locate button
      mapLocateBtn.classList.add('gps-active');
    });
  }

  // Mobile detail overlay close
  const closeDetailBtn = document.getElementById('close-detail-btn');
  const detailOverlay = document.getElementById('detail-overlay');
  if (closeDetailBtn && detailOverlay) {
    closeDetailBtn.addEventListener('click', () => {
      detailOverlay.classList.add('hidden');
    });
    detailOverlay.addEventListener('click', (e) => {
      if (e.target === detailOverlay) {
        detailOverlay.classList.add('hidden');
      }
    });
  }

  // Map Layer / Theme selector
  const layerBtns = document.querySelectorAll('.layer-btn');
  layerBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      layerBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      
      const layerName = e.target.dataset.layer;
      const mapWrapper = document.getElementById('map-wrapper');
      const sweepEl = document.getElementById('radar-sweep');
      const gridEl = document.getElementById('radar-grid');
      const vignetteEl = document.getElementById('radar-vignette');
      const crtEl = document.getElementById('radar-crt');

      // Remove all tile layers
      Object.values(tileLayers).forEach(l => map.removeLayer(l));

      // Reset theme classes & hidden overlays
      mapWrapper.classList.remove('radar-theme');
      sweepEl.classList.add('hidden');
      gridEl.classList.add('hidden');
      if (vignetteEl) vignetteEl.classList.add('hidden');
      if (crtEl) crtEl.classList.add('hidden');

      if (layerName === 'radar') {
        // Radar theme requires Dark Matter tiles + CSS filter classes + sweep/grid elements
        tileLayers.radar.addTo(map);
        mapWrapper.classList.add('radar-theme');
        sweepEl.classList.remove('hidden');
        gridEl.classList.remove('hidden');
        if (vignetteEl) vignetteEl.classList.remove('hidden');
        if (crtEl) crtEl.classList.remove('hidden');
      } else {
        tileLayers[layerName].addTo(map);
      }
    });
  });

  // Region dropdown selection change
  const regionSelector = document.getElementById('region-selector');
  if (regionSelector) {
    regionSelector.value = selectedRegion; // set default value from memory
    
    regionSelector.addEventListener('change', async (e) => {
      const countyId = e.target.value;
      selectedRegion = countyId;
      localStorage.setItem('selectedRegion', countyId);
      
      // Dynamic load reserves for county
      await loadCountyReserves(countyId);
      
      // Center map view on county center
      const view = countyViews[countyId];
      if (view) {
        map.setView(view.center, view.zoom);
      }
    });
  }

  // Snabbval (Quick zooms)
  const zoomBtns = document.querySelectorAll('.zoom-btn');
  zoomBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const lat = parseFloat(e.target.dataset.lat);
      const lng = parseFloat(e.target.dataset.lng);
      const zoom = parseInt(e.target.dataset.zoom);
      const region = e.target.dataset.region;
      
      // If quick zoom button defines a region, select it
      if (region && regionSelector) {
        regionSelector.value = region;
        regionSelector.dispatchEvent(new Event('change'));
      } else {
        map.setView([lat, lng], zoom);
      }
      
      if (window.innerWidth <= 768 && sidebar) {
        setSnap('hidden');
      }
    });
  });

  // Search input events
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  if (searchForm && searchInput) {
    let debounceTimer;
    
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      const query = e.target.value;
      debounceTimer = setTimeout(() => performSearch(query), 400);
    });

    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      performSearch(searchInput.value);
    });

    document.addEventListener('click', (e) => {
      const results = document.getElementById('search-results');
      if (results && !searchForm.contains(e.target) && !results.contains(e.target)) {
        results.classList.add('hidden');
      }
    });
  }

  // Filter Checkbox controls
  const filterAuth = document.getElementById('filter-auth');
  const filterCond = document.getElementById('filter-cond');
  const filterInfo = document.getElementById('filter-info');
  const filterNvr = document.getElementById('filter-nvr');

  const handleFilterChange = () => {
    activeFilters.REQ_AUTHORIZATION = filterAuth.checked;
    activeFilters.CONDITIONAL = filterCond.checked;
    activeFilters.NO_RESTRICTION = filterInfo.checked;
    activeFilters.nvr = filterNvr ? filterNvr.checked : true;
    renderZones();
    updateLocalZonesList();
    if (userLocation) {
      checkUserFlightStatus(userLocation);
    }
  };

  if (filterAuth) filterAuth.addEventListener('change', handleFilterChange);
  if (filterCond) filterCond.addEventListener('change', handleFilterChange);
  if (filterInfo) filterInfo.addEventListener('change', handleFilterChange);
  if (filterNvr) filterNvr.addEventListener('change', handleFilterChange);

  // Garmin Sync Export Button
  const exportGpxBtn = document.getElementById('export-gpx-btn');
  if (exportGpxBtn) {
    exportGpxBtn.addEventListener('click', exportToGpx);
  }

  // Accordion Toggle for About/Disclaimer section
  // ── Generic accordion helper ──────────────────────────────────────────────
  function setupAccordion(btnId, panelId) {
    const btn   = document.getElementById(btnId);
    const panel = document.getElementById(panelId);
    if (!btn || !panel) return;
    btn.addEventListener('click', () => {
      const isCollapsed = panel.classList.contains('collapsed');
      panel.classList.toggle('collapsed');
      btn.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false');
      const arrow = btn.querySelector('.arrow-icon');
      if (arrow) arrow.style.transform = isCollapsed ? 'rotate(180deg)' : '';
      initLucide();
    });
  }
  setupAccordion('filter-toggle-btn', 'filter-panel');

  // ── Info Modals (Om appen & Regler) ───────────────────────────────────────
  function openModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.remove('hidden'); initLucide(); }
  }
  function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('hidden');
  }
  document.getElementById('open-about-btn')?.addEventListener('click', () => openModal('about-modal'));
  document.getElementById('close-about-modal')?.addEventListener('click', () => closeModal('about-modal'));
  document.getElementById('about-modal')?.addEventListener('click', (e) => { if (e.target.id === 'about-modal') closeModal('about-modal'); });

  document.getElementById('open-rules-btn')?.addEventListener('click', () => openModal('rules-modal'));
  document.getElementById('close-rules-modal')?.addEventListener('click', () => closeModal('rules-modal'));
  document.getElementById('rules-modal')?.addEventListener('click', (e) => { if (e.target.id === 'rules-modal') closeModal('rules-modal'); });

  // ── SMHI Väder ────────────────────────────────────────────────────────────
  const SMHI_SYMBOLS = {
    1:'☀️',2:'🌤️',3:'⛅',4:'🌥️',5:'☁️',6:'☁️',7:'🌫️',
    8:'🌦️',9:'🌧️',10:'🌧️',11:'⛈️',12:'🌨️',13:'🌨️',14:'🌨️',
    15:'❄️',16:'❄️',17:'❄️',18:'🌦️',19:'🌦️',20:'🌦️',
    21:'⛈️',22:'🌨️',23:'🌨️',24:'🌨️',25:'🌨️',26:'🌨️',27:'🌨️'
  };
  function degToCompass(deg) {
    const dirs = ['N','NNO','NO','ONO','O','OSO','SO','SSO','S','SSV','SV','VSV','V','VNV','NV','NNV'];
    return dirs[Math.round(deg / 22.5) % 16];
  }
  function windStatusClass(ws) {
    if (ws < 5)  return ['wind-ok',   'Bra'];
    if (ws < 9)  return ['wind-warn', 'Försiktigt'];
    return              ['wind-bad',  'Flyg ej'];
  }
  async function fetchSMHIWeather(lat, lng) {
    const lon = lng.toFixed(6);
    const la  = lat.toFixed(6);
    const url = `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${lon}/lat/${la}/data.json`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return;
      const data = await resp.json();
      const ts   = data.timeSeries && data.timeSeries[0];
      if (!ts) return;
      const get = name => {
        const p = ts.parameters.find(x => x.name === name);
        return p ? p.values[0] : null;
      };
      const temp   = get('t');
      const ws     = get('ws');
      const wd     = get('wd');
      const sym    = get('Wsymb2');

      const card   = document.getElementById('weather-card');
      if (!card) return;
      card.classList.remove('hidden');

      document.getElementById('weather-symbol').textContent    = SMHI_SYMBOLS[sym] || '🌡️';
      document.getElementById('weather-temp').textContent       = temp != null ? `${Math.round(temp)}°C` : '--°C';
      document.getElementById('weather-wind-speed').textContent = ws  != null ? `${ws.toFixed(1)} m/s ${degToCompass(wd)}` : '-- m/s';

      const arrow = document.getElementById('weather-wind-arrow');
      if (arrow && wd != null) arrow.style.transform = `rotate(${wd}deg)`;

      const [cls, label] = windStatusClass(ws != null ? ws : 0);
      const statusEl = document.getElementById('weather-wind-status');
      statusEl.textContent = label;
      statusEl.className   = `wind-status ${cls}`;

      const now = new Date();
      document.getElementById('weather-updated').textContent =
        `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    } catch (err) {
      console.warn('SMHI weather fetch failed:', err);
    }
  }


  // Color Palette Selector buttons
  const paletteBtns = document.querySelectorAll('.palette-btn');
  if (paletteBtns.length > 0) {
    paletteBtns.forEach(btn => {
      if (btn.dataset.palette === selectedPalette) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    paletteBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const palette = e.target.dataset.palette;
        selectedPalette = palette;
        localStorage.setItem('selectedPalette', palette);
        
        // Remove old palette class and add new one
        document.body.className = document.body.className.replace(/\bpalette-\w+\b/g, '');
        document.body.classList.add(`palette-${palette}`);

        paletteBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      });
    });
  }

  // Startup check for disclaimer modal
  const disclaimerModal = document.getElementById('disclaimer-modal');
  const acceptDisclaimerBtn = document.getElementById('accept-disclaimer-btn');
  const modalDisclaimerLink = document.getElementById('modal-disclaimer-link');
  
  if (disclaimerModal && acceptDisclaimerBtn) {
    const hasAccepted = localStorage.getItem('disclaimerAccepted') === 'true';
    if (!hasAccepted) {
      disclaimerModal.classList.remove('hidden');
    }
    
    acceptDisclaimerBtn.addEventListener('click', () => {
      localStorage.setItem('disclaimerAccepted', 'true');
      disclaimerModal.classList.add('hidden');
    });

    if (modalDisclaimerLink) {
      modalDisclaimerLink.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.setItem('disclaimerAccepted', 'true');
        disclaimerModal.classList.add('hidden');
        
        // Open the sidebar about panel and scroll to it
        const aboutPanel = document.getElementById('about-panel');
        const aboutToggleBtn = document.getElementById('about-toggle-btn');
        if (aboutPanel && aboutToggleBtn) {
          aboutPanel.classList.remove('collapsed');
          aboutToggleBtn.setAttribute('aria-expanded', 'true');
          setTimeout(() => {
            aboutPanel.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }, 100);
        }
      });
    }
  }

  // Close geofence warning banner event listener
  // Swish donation modal
  const swishBtn = document.getElementById('swish-btn');
  const swishModal = document.getElementById('swish-modal');
  const closeSwishModal = document.getElementById('close-swish-modal');

  if (swishBtn && swishModal) {
    swishBtn.addEventListener('click', () => {
      swishModal.classList.remove('hidden');
      initLucide();

      // Detect mobile: touch screen or narrow viewport
      const isMobile = window.matchMedia('(pointer: coarse)').matches
        || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      const desktopBlock = document.getElementById('swish-desktop');
      const mobileBlock  = document.getElementById('swish-mobile');

      if (isMobile) {
        desktopBlock.classList.add('hidden');
        mobileBlock.classList.remove('hidden');
      } else {
        desktopBlock.classList.remove('hidden');
        mobileBlock.classList.add('hidden');
      }
    });
    closeSwishModal.addEventListener('click', () => swishModal.classList.add('hidden'));
    swishModal.addEventListener('click', (e) => {
      if (e.target === swishModal) swishModal.classList.add('hidden');
    });
  }

  const closeGeofenceBtn = document.getElementById('close-geofence-btn');
  if (closeGeofenceBtn) {
    closeGeofenceBtn.addEventListener('click', () => {
      const banner = document.getElementById('geofence-warning-banner');
      if (banner) {
        banner.classList.add('hidden');
      }
      
      // Mute geofence safety effects for the currently active warning zone
      dismissedZoneName = activeWarningZoneName;
      geofenceWarningActive = false;
      
      if (geofenceAlarmInterval) {
        clearInterval(geofenceAlarmInterval);
        geofenceAlarmInterval = null;
      }
    });
  }

  // Geofence range slider event listener
  const geofenceRange = document.getElementById('geofence-range');
  const geofenceRangeVal = document.getElementById('geofence-range-val');
  if (geofenceRange && geofenceRangeVal) {
    const savedRange = localStorage.getItem('maxFlightDistance');
    if (savedRange) {
      maxFlightDistance = parseInt(savedRange, 10);
      geofenceRange.value = maxFlightDistance;
      geofenceRangeVal.textContent = `${maxFlightDistance} m`;
    }
    
    geofenceRange.addEventListener('input', (e) => {
      maxFlightDistance = parseInt(e.target.value, 10);
      geofenceRangeVal.textContent = `${maxFlightDistance} m`;
      localStorage.setItem('maxFlightDistance', maxFlightDistance);
      updateGeofenceCircle();
      
      // Re-evaluate geofence alarms instantly on slider update
      if (userLocation) {
        checkGeofenceAlert(userLocation);
      }
    });
  }

  // Setup GPS position positioning
  // ------------------------------------------------------------------
  // Cookie Consent (Consent Mode v2)
  // ------------------------------------------------------------------
  function applyConsent(granted) {
    if (typeof gtag === 'function') {
      gtag('consent', 'update', {
        'analytics_storage': granted ? 'granted' : 'denied',
        'ad_storage':        'denied',
        'ad_user_data':      'denied',
        'ad_personalization':'denied'
      });
    }
    localStorage.setItem('cookieConsent', granted ? 'granted' : 'denied');
  }

  function hideCookieUI() {
    const banner  = document.getElementById('cookie-banner');
    const details = document.getElementById('cookie-details');
    if (banner)  banner.classList.add('hidden');
    if (details) details.classList.add('hidden');
  }

  const savedConsent = localStorage.getItem('cookieConsent');
  if (savedConsent) {
    // Re-apply saved choice on every load
    applyConsent(savedConsent === 'granted');
  } else {
    // Show banner after short delay so app loads first
    setTimeout(() => {
      const banner = document.getElementById('cookie-banner');
      if (banner) {
        banner.classList.remove('hidden');
        initLucide();
      }
    }, 800);
  }

  // Accept buttons
  ['cookie-accept', 'cookie-accept-from-detail'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => { applyConsent(true);  hideCookieUI(); });
  });

  // Decline buttons
  ['cookie-decline', 'cookie-decline-from-detail'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => { applyConsent(false); hideCookieUI(); });
  });

  // "Läs mer" → open details panel
  const detailsLink  = document.getElementById('cookie-details-link');
  const detailsPanel = document.getElementById('cookie-details');
  const detailsClose = document.getElementById('cookie-details-close');
  if (detailsLink && detailsPanel) {
    detailsLink.addEventListener('click', (e) => {
      e.preventDefault();
      detailsPanel.classList.remove('hidden');
      initLucide();
    });
  }
  if (detailsClose) {
    detailsClose.addEventListener('click', () => detailsPanel.classList.add('hidden'));
  }

  setupGeolocation();
}

// ==========================================================================
// ACTIVE GEOFENCING PROXIMITY ALERTS (AUDIO & VIBRATION)
// ==========================================================================
let geofenceAlarmInterval = null;
let geofenceWarningActive = false;
let dismissedZoneName = null;
let activeWarningZoneName = '';
let activeWarningIsInside = false;
let maxFlightDistance = 150; // Default max flight distance (VLOS) in meters

function checkGeofenceAlert(latlng) {
  if (!latlng) return;
  
  let isAlertActive = false;
  let nearestZoneName = '';

  // Get only red (no-fly/restricted) zones where authorization is required
  const redZones = allFeatures.filter(f => f.properties.type === 'REQ_AUTHORIZATION');

  for (const zone of redZones) {
    const source = zone.properties.source;
    let points = [];
    let isInside = false;
    let isClose = false;

    // 1. Point geometries (mostly airports / heliports with circular warning buffers)
    if (zone.geometry.type === 'Point') {
      const centerLng = zone.geometry.coordinates[0];
      const centerLat = zone.geometry.coordinates[1];
      const centerLatLng = L.latLng(centerLat, centerLng);
      
      let radius = 5000; // default airport CTR exemption buffer (5 km)
      if (zone.geometry.extent && zone.geometry.extent.subType === 'Circle') {
        radius = zone.geometry.extent.radius;
      }
      
      const dist = map.distance(latlng, centerLatLng);
      if (dist < radius) {
        isInside = true;
        isAlertActive = true;
        nearestZoneName = getFeatureName(zone);
        break;
      } else if (dist < (radius + maxFlightDistance)) {
        isClose = true;
        isAlertActive = true;
        nearestZoneName = getFeatureName(zone);
        break;
      }
    } 
    // 2. Polygon geometries (Restriktionsområden, NOTAMs)
    else if (zone.geometry.type === 'Polygon') {
      const outerRing = zone.geometry.coordinates[0];
      points = outerRing.map(c => ({ lat: c[1], lng: c[0] }));
      
      isInside = isPointInPolygon(latlng, points);
      if (!isInside) {
        // Check if user is within maxFlightDistance of any boundary vertex
        for (const pt of points) {
          if (map.distance(latlng, L.latLng(pt.lat, pt.lng)) < maxFlightDistance) {
            isClose = true;
            break;
          }
        }
      }
      
      if (isInside || isClose) {
        isAlertActive = true;
        nearestZoneName = getFeatureName(zone);
        break;
      }
    } 
    // 3. MultiPolygon geometries
    else if (zone.geometry.type === 'MultiPolygon') {
      for (const poly of zone.geometry.coordinates) {
        const outerRing = poly[0];
        points = outerRing.map(c => ({ lat: c[1], lng: c[0] }));
        
        isInside = isPointInPolygon(latlng, points);
        if (!isInside) {
          for (const pt of points) {
            if (map.distance(latlng, L.latLng(pt.lat, pt.lng)) < maxFlightDistance) {
              isClose = true;
              break;
            }
          }
        }
        
        if (isInside || isClose) {
          isAlertActive = true;
          nearestZoneName = getFeatureName(zone);
          break;
        }
      }
      if (isAlertActive) break;
    }
  }

  // Handle geofence UI banner and device effects
  const banner = document.getElementById('geofence-warning-banner');
  const bannerText = document.getElementById('geofence-warning-text');

  // If a zone is active but it matches the dismissed zone name, keep UI muted
  if (isAlertActive && nearestZoneName === dismissedZoneName) {
    if (banner) banner.classList.add('hidden');
    if (geofenceAlarmInterval) {
      clearInterval(geofenceAlarmInterval);
      geofenceAlarmInterval = null;
    }
    return;
  }

  if (isAlertActive) {
    geofenceWarningActive = true;
    activeWarningZoneName = nearestZoneName;
    activeWarningIsInside = isInside;
    
    if (banner) {
      banner.classList.remove('hidden');
      if (bannerText) {
        if (activeWarningIsInside) {
          bannerText.innerHTML = `Du står <strong>inuti</strong> restriktionszonen <strong>"${nearestZoneName}"</strong>. <strong>Flygförbud!</strong>`;
        } else {
          bannerText.innerHTML = `Zonen <strong>"${nearestZoneName}"</strong> är inom din flygradie (${maxFlightDistance}m). Risk för intrång!`;
        }
      }
    }
    
    // Start warning sound beep interval if not running
    if (!geofenceAlarmInterval) {
      triggerGeofenceEffects();
      geofenceAlarmInterval = setInterval(triggerGeofenceEffects, 1500);
    }
  } else {
    geofenceWarningActive = false;
    activeWarningZoneName = '';
    activeWarningIsInside = false;
    dismissedZoneName = null; // reset dismissed state once they are clear of any zones
    
    if (banner) {
      banner.classList.add('hidden');
    }
    if (geofenceAlarmInterval) {
      clearInterval(geofenceAlarmInterval);
      geofenceAlarmInterval = null;
    }
  }
}

// Ray-casting Point-in-polygon helper
function isPointInPolygon(latlng, vs) {
  const x = latlng.lng, y = latlng.lat;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].lng, yi = vs[i].lat;
    const xj = vs[j].lng, yj = vs[j].lat;
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Sound Synthesizer via Web Audio API + vibration
let audioCtx = null;
function triggerGeofenceEffects() {
  if (!geofenceWarningActive) return;

  // 1. Synthesize alarm sound
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    // Play dual rapid warning beeps
    playBeep(980, 0.15); // High pitch B5
    setTimeout(() => playBeep(980, 0.15), 200);
  } catch (e) {
    console.error('Kunde inte spela upp geofence-ljud:', e);
  }

  // 2. Trigger vibration (vibe 300ms, pause 100ms, vibe 300ms)
  if (navigator.vibrate) {
    navigator.vibrate([300, 100, 300]);
  }
}

function playBeep(freq, duration) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  
  gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

// ── PWA Service Worker Registration ──────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('[SW] Registered, scope:', reg.scope);
        // When a new SW is waiting, skip waiting and reload to activate immediately
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[SW] New version available, reloading...');
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(err => console.warn('[SW] Registration failed:', err));

    // When the controller changes (new SW took over), reload the page
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[SW] Controller changed, reloading page...');
      window.location.reload();
    });
  });
}

