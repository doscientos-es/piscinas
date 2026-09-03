export type TimeTrackingPolicy = {
  early_start_tolerance_minutes: number
  late_start_tolerance_minutes: number
  geofence_radius_m: number
  max_location_accuracy_m: number
  require_exception_reason: boolean
}

export type TrackingCoordinates = {
  latitude: number
  longitude: number
  accuracy: number
}

export type StartException =
  | 'different_day'
  | 'too_early'
  | 'too_late'
  | 'outside_geofence'
  | 'low_accuracy'

export const defaultTimeTrackingPolicy: TimeTrackingPolicy = {
  early_start_tolerance_minutes: 15,
  late_start_tolerance_minutes: 90,
  geofence_radius_m: 250,
  max_location_accuracy_m: 200,
  require_exception_reason: true,
}

export function getStartExceptions({
  scheduledFor,
  position,
  installation,
  policy = defaultTimeTrackingPolicy,
  now = new Date(),
}: {
  scheduledFor: string | Date
  position: TrackingCoordinates
  installation?: { latitude: number | null; longitude: number | null }
  policy?: TimeTrackingPolicy
  now?: Date
}): StartException[] {
  const scheduled = new Date(scheduledFor)
  if (Number.isNaN(scheduled.getTime())) return ['too_late']

  const exceptions: StartException[] = []
  const differentDay =
    scheduled.getFullYear() !== now.getFullYear() ||
    scheduled.getMonth() !== now.getMonth() ||
    scheduled.getDate() !== now.getDate()
  if (differentDay) exceptions.push('different_day')
  else {
    const deltaMinutes = (now.getTime() - scheduled.getTime()) / 60_000
    if (deltaMinutes < -policy.early_start_tolerance_minutes) exceptions.push('too_early')
    if (deltaMinutes > policy.late_start_tolerance_minutes) exceptions.push('too_late')
  }

  if (position.accuracy > policy.max_location_accuracy_m) exceptions.push('low_accuracy')
  if (installation?.latitude != null && installation.longitude != null) {
    const distance = getDistanceMeters(position, {
      latitude: installation.latitude,
      longitude: installation.longitude,
    })
    if (distance > policy.geofence_radius_m) exceptions.push('outside_geofence')
  }
  return exceptions
}

export function getDistanceMeters(
  origin: Pick<TrackingCoordinates, 'latitude' | 'longitude'>,
  destination: { latitude: number; longitude: number },
) {
  const earthRadius = 6_371_000
  const latitudeDelta = toRadians(destination.latitude - origin.latitude)
  const longitudeDelta = toRadians(destination.longitude - origin.longitude)
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(origin.latitude)) *
      Math.cos(toRadians(destination.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2
  return 2 * earthRadius * Math.asin(Math.sqrt(a))
}

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

export const startExceptionLabel: Record<StartException, string> = {
  different_day: 'La visita está programada para otro día',
  too_early: 'El inicio es anterior a la franja permitida',
  too_late: 'El inicio supera el retraso permitido',
  outside_geofence: 'La ubicación queda fuera del radio de la instalación',
  low_accuracy: 'La precisión de ubicación es insuficiente',
}
