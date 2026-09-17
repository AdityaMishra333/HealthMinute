import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from './googleMaps';
import { TRACKING_MAP_STYLE, ambulanceArrowIcon, destinationPinIcon } from './mapStyles';
import { IconRecenter } from './Icons';

const PULSE_DURATION = 1800;

function LiveRouteMap({ origin, destination, onEtaChange, className, showRecenter = false }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapsApiRef = useRef(null);
  const rendererRef = useRef(null);
  const serviceRef = useRef(null);
  const originMarkerRef = useRef(null);
  const destMarkerRef = useRef(null);
  const pulseRef = useRef(null);
  const prevOriginRef = useRef(origin);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps().then((maps) => {
      if (cancelled || !containerRef.current) return;
      mapsApiRef.current = maps;

      mapRef.current = new maps.Map(containerRef.current, {
        center: { lat: origin.latitude, lng: origin.longitude },
        zoom: 14,
        disableDefaultUI: true,
        clickableIcons: false,
        styles: TRACKING_MAP_STYLE,
      });

      rendererRef.current = new maps.DirectionsRenderer({
        map: mapRef.current,
        suppressMarkers: true,
        preserveViewport: true,
        // --status-active-dot — mirrors src/styles/theme.css, kept in sync by hand.
        polylineOptions: { strokeColor: '#f5a623', strokeWeight: 5, strokeOpacity: 0.95 },
      });
      serviceRef.current = new maps.DirectionsService();

      const initialHeading = maps.geometry.spherical.computeHeading(
        new maps.LatLng(origin.latitude, origin.longitude),
        new maps.LatLng(destination.latitude, destination.longitude)
      );

      originMarkerRef.current = new maps.Marker({
        map: mapRef.current,
        icon: ambulanceArrowIcon(maps, initialHeading),
        position: { lat: origin.latitude, lng: origin.longitude },
        zIndex: 10,
      });
      destMarkerRef.current = new maps.Marker({
        map: mapRef.current,
        icon: destinationPinIcon(maps),
        position: { lat: destination.latitude, lng: destination.longitude },
        zIndex: 9,
      });

      startPulse(maps, mapRef.current, { lat: destination.latitude, lng: destination.longitude });
      setReady(true);
      fitToMarkers();
      requestRoute();
    });

    return () => {
      cancelled = true;
      if (pulseRef.current) {
        cancelAnimationFrame(pulseRef.current.raf);
        pulseRef.current.circle.setMap(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!serviceRef.current) return;
    const maps = mapsApiRef.current;

    const prev = prevOriginRef.current;
    if (prev.latitude !== origin.latitude || prev.longitude !== origin.longitude) {
      const heading = maps.geometry.spherical.computeHeading(
        new maps.LatLng(prev.latitude, prev.longitude),
        new maps.LatLng(origin.latitude, origin.longitude)
      );
      originMarkerRef.current?.setIcon(ambulanceArrowIcon(maps, heading));
      prevOriginRef.current = origin;
    }

    originMarkerRef.current?.setPosition({ lat: origin.latitude, lng: origin.longitude });
    destMarkerRef.current?.setPosition({ lat: destination.latitude, lng: destination.longitude });
    pulseRef.current?.circle.setCenter({ lat: destination.latitude, lng: destination.longitude });
    requestRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.latitude, origin.longitude, destination.latitude, destination.longitude]);

  function startPulse(maps, map, center) {
    // --status-active-dot — mirrors src/styles/theme.css, kept in sync by hand.
    const circle = new maps.Circle({
      map,
      center,
      radius: 30,
      fillColor: '#f5a623',
      fillOpacity: 0.28,
      strokeColor: '#f5a623',
      strokeOpacity: 0.4,
      strokeWeight: 1,
      clickable: false,
    });

    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const t = ((ts - start) % PULSE_DURATION) / PULSE_DURATION;
      circle.setRadius(30 + t * 260);
      circle.setOptions({ fillOpacity: 0.28 * (1 - t), strokeOpacity: 0.4 * (1 - t) });
      pulseRef.current.raf = requestAnimationFrame(step);
    };
    pulseRef.current = { circle, raf: requestAnimationFrame(step) };
  }

  const fitToMarkers = () => {
    const maps = mapsApiRef.current;
    if (!maps || !mapRef.current) return;
    const bounds = new maps.LatLngBounds();
    bounds.extend({ lat: origin.latitude, lng: origin.longitude });
    bounds.extend({ lat: destination.latitude, lng: destination.longitude });
    mapRef.current.fitBounds(bounds, 72);
  };

  const requestRoute = () => {
    serviceRef.current.route(
      {
        origin: { lat: origin.latitude, lng: origin.longitude },
        destination: { lat: destination.latitude, lng: destination.longitude },
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status !== 'OK') return;
        rendererRef.current.setDirections(result);
        fitToMarkers();
        const leg = result.routes[0]?.legs[0];
        if (leg && onEtaChange) onEtaChange(leg.duration?.text ?? null);
      }
    );
  };

  return (
    <div className={`live-route-map ${className || ''}`}>
      <div ref={containerRef} className="live-route-map-canvas" />

      {!ready && (
        <div className="live-route-map-loading">
          <span className="map-spinner" />
        </div>
      )}

      {showRecenter && ready && (
        <button type="button" className="map-recenter-btn" onClick={fitToMarkers} aria-label="Recenter map">
          <IconRecenter size={18} />
        </button>
      )}
    </div>
  );
}

export default LiveRouteMap;
