import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from './googleMaps';
import { TRACKING_MAP_STYLE, ambulanceArrowIcon, destinationPinIcon } from './mapStyles';
import { haversineKm } from './geo';
import './AmbulanceTracker.css';

const AVERAGE_SPEED_KMH = 30;

function etaMinutesFor(distanceKm) {
  return Math.max(1, Math.round((distanceKm / AVERAGE_SPEED_KMH) * 60));
}

// Live ambulance-tracking widget for the reporter and hospital surfaces:
// two markers (the accident, fixed, and the ambulance, live via whatever
// onSnapshot listener the caller already has), a straight line between
// them, and a distance/ETA line above the map. Deliberately simpler than
// LiveRouteMap — no routed directions, no pulse — since this position is
// simulated, not a real GPS route.
function AmbulanceTracker({ accident, onEtaChange, className = '' }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapsApiRef = useRef(null);
  const ambulanceMarkerRef = useRef(null);
  const destMarkerRef = useRef(null);
  const polylineRef = useRef(null);
  const [ready, setReady] = useState(false);

  const ambulanceLocation = accident.ambulanceLocation;
  const destination = { latitude: accident.latitude, longitude: accident.longitude };
  const arrived = accident.status === 'arrived' || accident.status === 'resolved';
  const distanceKm = ambulanceLocation ? haversineKm(ambulanceLocation, destination) : null;
  const etaMinutes = distanceKm != null ? etaMinutesFor(distanceKm) : null;

  useEffect(() => {
    if (!onEtaChange) return;
    onEtaChange(arrived ? 'Arrived' : etaMinutes != null ? `${etaMinutes} min` : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etaMinutes, arrived]);

  // Create the map once, the first time we have somewhere to put it.
  useEffect(() => {
    if (!ambulanceLocation) return undefined;
    let cancelled = false;

    loadGoogleMaps().then((maps) => {
      if (cancelled || !containerRef.current) return;
      mapsApiRef.current = maps;

      mapRef.current = new maps.Map(containerRef.current, {
        center: { lat: ambulanceLocation.latitude, lng: ambulanceLocation.longitude },
        zoom: 13,
        disableDefaultUI: true,
        clickableIcons: false,
        styles: TRACKING_MAP_STYLE,
      });

      destMarkerRef.current = new maps.Marker({
        map: mapRef.current,
        position: { lat: destination.latitude, lng: destination.longitude },
        icon: destinationPinIcon(maps),
        zIndex: 9,
      });

      ambulanceMarkerRef.current = new maps.Marker({
        map: mapRef.current,
        position: { lat: ambulanceLocation.latitude, lng: ambulanceLocation.longitude },
        icon: ambulanceArrowIcon(maps, 0),
        zIndex: 10,
      });

      polylineRef.current = new maps.Polyline({
        map: mapRef.current,
        path: [
          { lat: ambulanceLocation.latitude, lng: ambulanceLocation.longitude },
          { lat: destination.latitude, lng: destination.longitude },
        ],
        // --status-active-dot — mirrors src/styles/theme.css, kept in sync by hand.
        strokeColor: '#f5a623',
        strokeWeight: 4,
        strokeOpacity: 0.9,
      });

      fitToMarkers(maps);
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
    // Only ever runs once, the first time ambulanceLocation goes from
    // absent to present — subsequent moves are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!ambulanceLocation]);

  // Move the existing markers/line as the (simulated) position updates,
  // rather than recreating the map on every tick.
  useEffect(() => {
    const maps = mapsApiRef.current;
    if (!maps || !ambulanceMarkerRef.current || !ambulanceLocation) return;

    const newPosition = new maps.LatLng(ambulanceLocation.latitude, ambulanceLocation.longitude);
    const heading = maps.geometry?.spherical?.computeHeading(ambulanceMarkerRef.current.getPosition(), newPosition);
    if (heading != null && !Number.isNaN(heading)) {
      ambulanceMarkerRef.current.setIcon(ambulanceArrowIcon(maps, heading));
    }

    ambulanceMarkerRef.current.setPosition(newPosition);
    polylineRef.current?.setPath([newPosition, { lat: destination.latitude, lng: destination.longitude }]);
    fitToMarkers(maps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambulanceLocation?.latitude, ambulanceLocation?.longitude]);

  function fitToMarkers(maps) {
    if (!mapRef.current || !ambulanceLocation) return;
    const bounds = new maps.LatLngBounds();
    bounds.extend({ lat: ambulanceLocation.latitude, lng: ambulanceLocation.longitude });
    bounds.extend({ lat: destination.latitude, lng: destination.longitude });
    mapRef.current.fitBounds(bounds, 56);
  }

  if (!ambulanceLocation) return null;

  return (
    <div className={`ambulance-tracker ${className}`}>
      <p className="ambulance-tracker-eta">
        {arrived ? (
          'The ambulance has arrived at the location.'
        ) : (
          <>
            Ambulance is <strong className="tnum">{distanceKm.toFixed(1)} km</strong> away, arriving in{' '}
            <strong className="tnum">{etaMinutes} min</strong>
          </>
        )}
      </p>

      <div className="ambulance-tracker-map">
        <div ref={containerRef} className="ambulance-tracker-canvas" />
        {!ready && (
          <div className="ambulance-tracker-loading">
            <span className="spinner spinner-sm" />
          </div>
        )}
      </div>
    </div>
  );
}

export default AmbulanceTracker;
