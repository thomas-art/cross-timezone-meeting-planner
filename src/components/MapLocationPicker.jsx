import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DateTime } from 'luxon';
import tzlookup from 'tz-lookup';
import countries from './data/countries.geo.json';
import * as turf from '@turf/turf';

// Helper to get timezone from lat/lng using tz-lookup (no API, no token)
function getTimezone(lat, lng) {
  try {
    return tzlookup(lat, lng);
  } catch {
    return null;
  }
}

// Helper to get country/region from lat/lng using GeoJSON + turf.js (no API, no token)
function getCountryRegion(lat, lng) {
  const pt = turf.point([lng, lat]);
  for (const feature of countries.features) {
    if (
      feature.geometry &&
      (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') &&
      turf.booleanPointInPolygon(pt, feature)
    ) {
      return feature.properties.name || feature.properties.ADMIN || feature.properties.NAME || 'Unknown';
    }
  }
  return 'Unknown';
}

function getCountryRegionWithISO(lat, lng) {
  const pt = turf.point([lng, lat]);
  for (const feature of countries.features) {
    if (
      feature.geometry &&
      (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') &&
      turf.booleanPointInPolygon(pt, feature)
    ) {
      return {
        name: feature.properties.name || feature.properties.ADMIN || feature.properties.NAME || 'Unknown',
        iso2: feature.properties["ISO3166-1-Alpha-2"] || '',
      };
    }
  }
  return { name: 'Unknown', iso2: '' };
}

export default function MapLocationPicker({ onAddParticipant, selectedParticipants }) {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);

  useEffect(() => {
    if (!leafletMap.current) {
      leafletMap.current = L.map(mapRef.current, {
        center: [20, 0],
        zoom: 2,
        worldCopyJump: true,
        minZoom: 2,
        maxZoom: 6,
        attributionControl: false,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(leafletMap.current);
    }
    leafletMap.current.zoomControl.remove();

    // Handle map click
    const handleClick = (e) => {
      const { lat, lng } = e.latlng;
      // Get country/region and timezone
      const countryObj = getCountryRegionWithISO(lat, lng);
      const timezone = getTimezone(lat, lng);
      let tz = timezone || 'UTC';
      let warning = '';
      if (!timezone) {
        warning = ' (Timezone could not be detected, using UTC)';
      }
      const now = DateTime.now().setZone(tz);
      const participant = {
        id: `${lat},${lng}`,
        name: countryObj.name,
        iso2: countryObj.iso2,
        timezone: tz + warning,
        time: now.toFormat('HH:mm, ccc'),
        lat,
        lng,
      };
      onAddParticipant(participant);
    };
    leafletMap.current.on('click', handleClick);
    return () => {
      leafletMap.current.off('click', handleClick);
    };
  }, [onAddParticipant]);

  // Show markers for selected participants
  useEffect(() => {
    if (!leafletMap.current) return;
    // Remove all markers
    leafletMap.current.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        leafletMap.current.removeLayer(layer);
      }
    });
    // Add markers for all selected participants
    selectedParticipants.forEach((p) => {
      const marker = L.marker([p.lat, p.lng]).addTo(leafletMap.current);
      marker.bindTooltip(
        `<div><strong>${p.name}</strong><br/>${p.time}<br/><span style='font-size:0.8em;'>${p.timezone}</span></div>`,
        { permanent: true, direction: 'top', className: 'leaflet-tooltip-own' }
      );
    });
  }, [selectedParticipants]);

  return (
    <div className="w-full h-full rounded-xl overflow-hidden shadow-lg relative">
      <div ref={mapRef} className="w-full h-full" style={{ minHeight: 500, minWidth: 500 }} />
      <div className="absolute top-4 left-4 bg-white bg-opacity-80 rounded-lg px-4 py-2 shadow text-blue-900">
        <span className="font-semibold">Click on the map to add a location</span>
      </div>
    </div>
  );
}
