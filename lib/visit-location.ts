export type VisitLocation = {
  installationName?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
}

export type WorkerPosition = {
  latitude: number
  longitude: number
  accuracy: number
}

export function hasVisitCoordinates({ latitude, longitude }: VisitLocation) {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  )
}

export function hasValidWorkerPosition(position: WorkerPosition) {
  return (
    hasVisitCoordinates(position) &&
    Number.isFinite(position.accuracy) &&
    position.accuracy >= 0 &&
    position.accuracy <= 10_000
  )
}

function getMapQuery({ installationName, address, latitude, longitude }: VisitLocation) {
  if (hasVisitCoordinates({ latitude, longitude })) return `${latitude},${longitude}`
  return address?.trim() || installationName?.trim() || ''
}

/** Builds URLs that work with coordinates when available and fall back to the saved address. */
export function getVisitMapUrls(location: VisitLocation) {
  const encodedQuery = encodeURIComponent(getMapQuery(location))
  return {
    embedUrl: `https://www.google.com/maps?q=${encodedQuery}&output=embed`,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodedQuery}`,
  }
}