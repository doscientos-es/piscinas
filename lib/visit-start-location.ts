import type { TimeTrackingPolicy, TrackingCoordinates } from './time-tracking-policy'

type InstallationCoordinates = {
  location_latitude: number | null
  location_longitude: number | null
}

export function getStoredInstallationLocation(
  installation: InstallationCoordinates | null,
): TrackingCoordinates | null {
  if (
    installation?.location_latitude == null ||
    installation.location_longitude == null ||
    !Number.isFinite(installation.location_latitude) ||
    !Number.isFinite(installation.location_longitude)
  ) {
    return null
  }

  return {
    latitude: installation.location_latitude,
    longitude: installation.location_longitude,
    // Estas coordenadas proceden de la instalación guardada, no de una lectura GPS.
    accuracy: 0,
  }
}

export function isUsableVisitLocation(
  position: TrackingCoordinates,
  policy: Pick<TimeTrackingPolicy, 'max_location_accuracy_m'>,
) {
  return (
    Number.isFinite(position.latitude) &&
    position.latitude >= -90 &&
    position.latitude <= 90 &&
    Number.isFinite(position.longitude) &&
    position.longitude >= -180 &&
    position.longitude <= 180 &&
    Number.isFinite(position.accuracy) &&
    position.accuracy >= 0 &&
    position.accuracy <= policy.max_location_accuracy_m
  )
}
