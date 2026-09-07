export type VisitLocation = {
  installationName?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
}

function getMapQuery({ installationName, address, latitude, longitude }: VisitLocation) {
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) return `${latitude},${longitude}`
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