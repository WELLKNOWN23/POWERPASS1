
import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from 'react-leaflet';

import type { Workspace } from '../types/workspace';
import 'leaflet/dist/leaflet.css';
import './WorkspaceMap.css';

interface WorkspaceMapProps {
  workspaces: Workspace[];
  onSelectWorkspace: (id: string) => void;
}

const workspaceMarker = L.divIcon({
  className: 'workspace-marker-container',
  html: '<div class="workspace-map-pin"></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function MapAutoFit({
  workspaces,
}: {
  workspaces: Workspace[];
}) {
  const map = useMap();

  useEffect(() => {
    if (workspaces.length === 0) return;

    const positions = workspaces.map((workspace) =>
      L.latLng(workspace.latitude, workspace.longitude),
    );

    if (positions.length === 1) {
      map.flyTo(positions[0], 14, {
        animate: true,
        duration: 1.2,
      });
      return;
    }

    const bounds = L.latLngBounds(positions);

    map.flyToBounds(bounds, {
      padding: [65, 65],
      maxZoom: 14,
      duration: 1.4,
    });
  }, [map, workspaces]);

  return null;
}

export default function WorkspaceMap({
  workspaces,
  onSelectWorkspace,
}: WorkspaceMapProps) {
  const validWorkspaces = useMemo(
    () =>
      workspaces.filter(
        (workspace) =>
          Number.isFinite(workspace.latitude) &&
          Number.isFinite(workspace.longitude) &&
          workspace.latitude >= 4 &&
          workspace.latitude <= 14 &&
          workspace.longitude >= 2 &&
          workspace.longitude <= 5,
      ),
    [workspaces],
  );

  return (
    <div className="workspace-map-wrapper">
      <MapContainer
        center={[7.38, 3.90]}
        zoom={8}
        minZoom={6}
        maxZoom={18}
        scrollWheelZoom
        className="workspace-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapAutoFit workspaces={validWorkspaces} />

        {validWorkspaces.map((workspace) => (
          <Marker
            key={workspace.id}
            position={[
              workspace.latitude,
              workspace.longitude,
            ]}
            icon={workspaceMarker}
          >
            <Popup>
              <div className="workspace-popup">
                <strong>{workspace.name}</strong>
                <span>{workspace.location}</span>

                <b>
                  ₦{workspace.price.toLocaleString('en-NG')} / day
                </b>

                <button
                  onClick={() => onSelectWorkspace(workspace.id)}
                >
                  View workspace
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {validWorkspaces.length === 0 && (
        <div className="map-empty-message">
          No workspace locations available yet.
        </div>
      )}

      <div className="map-region-label">
        LIVE WORKSPACE LOCATIONS
      </div>
    </div>
  );
}
