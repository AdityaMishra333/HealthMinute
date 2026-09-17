// A warm, low-contrast map theme (paper/cream tones) so the teal route and
// markers read as the focal point — the palette DelTrack's tracking screen uses.
export const TRACKING_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f2ede1' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9a9184' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f2ede1' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#e2dbc9' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d7e4d3' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e7dfcd' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#a79d8c' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cfe0e8' }] },
];

// Colours mirror src/styles/theme.css and must be kept in sync by hand —
// the Google Maps SDK takes literal colour strings, not CSS custom
// properties. The destination pin is brand-accent (a neutral "place"
// marker); the moving ambulance/route uses the "active" status colour,
// consistent with the status pills shown elsewhere for an en-route case.
const PIN_ACCENT = '#4361ee'; // --color-primary
const ROUTE_ACTIVE = '#f5a623'; // --status-active-dot

const DESTINATION_PIN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="44" height="56" viewBox="0 0 44 56">
  <ellipse cx="22" cy="46" rx="10" ry="4" fill="#171b34" opacity="0.16"/>
  <circle cx="22" cy="22" r="17" fill="${PIN_ACCENT}" stroke="#ffffff" stroke-width="3.5"/>
  <circle cx="22" cy="22" r="6" fill="#ffffff"/>
</svg>`;

function toDataUrl(svg) {
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

// A directional arrow puck for the moving ambulance — rotates to match heading,
// mirroring the navigation-style marker in the DelTrack reference.
export function ambulanceArrowIcon(maps, heading = 0) {
  return {
    path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale: 6.4,
    fillColor: ROUTE_ACTIVE,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
    rotation: heading,
  };
}

export function destinationPinIcon(maps) {
  return {
    url: toDataUrl(DESTINATION_PIN_SVG),
    scaledSize: new maps.Size(44, 56),
    anchor: new maps.Point(22, 28),
  };
}
