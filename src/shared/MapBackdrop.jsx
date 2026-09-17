// Before any real location is known, a wide, low-zoom view — decorative
// texture only, not a claim about where the user is.
const DEFAULT_CENTER = '20,10';
const DEFAULT_ZOOM = 3;
const FOCUSED_ZOOM = 14;

// A full-viewport map used purely as page texture behind the glass panels —
// just a picture, not a live/interactive map. Uses the same key-less Google
// Maps embed iframe already used elsewhere in the app (the widget map, the
// dispatch map pane), not the Maps JavaScript API — no API key, no billing,
// no "this page can't load Google Maps" dependency for this piece.
// pointer-events is off in CSS so it can't be panned/scrolled/clicked.
function MapBackdrop({ center }) {
  const query = center ? `${center.latitude},${center.longitude}` : DEFAULT_CENTER;
  const zoom = center ? FOCUSED_ZOOM : DEFAULT_ZOOM;

  return (
    <div className="map-backdrop" aria-hidden="true">
      <div className="map-backdrop-blur-wrap">
        <iframe
          key={query}
          className="map-backdrop-canvas"
          title="Decorative map background"
          src={`https://www.google.com/maps?q=${query}&z=${zoom}&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <div className="map-backdrop-scrim" />
    </div>
  );
}

export default MapBackdrop;
