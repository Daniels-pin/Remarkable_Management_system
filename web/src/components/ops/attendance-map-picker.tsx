"use client";

import * as React from "react";
import L from "leaflet";
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

export type MapPickerValue = {
  latitude: number;
  longitude: number;
  locationLabel: string;
};

type Props = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  locationLabel: string;
  onChange: (value: MapPickerValue) => void;
  readOnly?: boolean;
};

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

/** Bounds for a geodesic circle without attaching a layer to the map (Leaflet getBounds needs _map). */
function circleLatLngBounds(
  latitude: number,
  longitude: number,
  radiusMeters: number,
): L.LatLngBounds {
  const earthRadius = 6_378_137;
  const latDelta = (radiusMeters / earthRadius) * (180 / Math.PI);
  const lngDelta =
    (radiusMeters / earthRadius) * (180 / Math.PI) / Math.cos((latitude * Math.PI) / 180);
  return L.latLngBounds(
    [latitude - latDelta, longitude - lngDelta],
    [latitude + latDelta, longitude + lngDelta],
  );
}

function MapSync({
  latitude,
  longitude,
  radiusMeters,
}: {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}) {
  const map = useMap();
  React.useEffect(() => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    map.setView([latitude, longitude], map.getZoom(), { animate: true });
  }, [latitude, longitude, map]);
  React.useEffect(() => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || radiusMeters <= 0) return;
    const bounds = circleLatLngBounds(latitude, longitude, radiusMeters);
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18, animate: true });
  }, [latitude, longitude, radiusMeters, map]);
  return null;
}

function ClickHandler({
  onPick,
  disabled,
}: {
  onPick: (lat: number, lng: number) => void;
  disabled?: boolean;
}) {
  useMapEvents({
    click(e) {
      if (disabled) return;
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function DraggablePin({
  latitude,
  longitude,
  onMove,
  readOnly,
}: {
  latitude: number;
  longitude: number;
  onMove: (lat: number, lng: number) => void;
  readOnly?: boolean;
}) {
  const markerRef = React.useRef<L.Marker>(null);
  const eventHandlers = React.useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (!marker) return;
        const pos = marker.getLatLng();
        onMove(pos.lat, pos.lng);
      },
    }),
    [onMove],
  );

  return (
    <Marker
      draggable={!readOnly}
      eventHandlers={eventHandlers}
      icon={defaultIcon}
      position={[latitude, longitude]}
      ref={markerRef}
    />
  );
}

export function AttendanceMapPicker({
  latitude,
  longitude,
  radiusMeters,
  locationLabel,
  onChange,
  readOnly = false,
}: Props) {
  const handlePick = React.useCallback(
    (lat: number, lng: number) => {
      onChange({
        latitude: lat,
        longitude: lng,
        locationLabel: locationLabel || "Pinned location",
      });
    },
    [locationLabel, onChange],
  );

  const centerLat = Number.isFinite(latitude) ? latitude : 6.5244;
  const centerLng = Number.isFinite(longitude) ? longitude : 3.3792;

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--shadow-card)]">
      <MapContainer
        center={[centerLat, centerLng]}
        className="h-[320px] w-full z-0"
        scrollWheelZoom
        zoom={17}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <DraggablePin
          latitude={centerLat}
          longitude={centerLng}
          onMove={handlePick}
          readOnly={readOnly}
        />
        <Circle
          center={[centerLat, centerLng]}
          pathOptions={{
            color: "hsl(220 70% 45%)",
            fillColor: "hsl(220 70% 45%)",
            fillOpacity: 0.12,
            weight: 2,
          }}
          radius={radiusMeters}
        />
        <MapSync latitude={centerLat} longitude={centerLng} radiusMeters={radiusMeters} />
        <ClickHandler disabled={readOnly} onPick={handlePick} />
      </MapContainer>
    </div>
  );
}
