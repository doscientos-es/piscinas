export function isLocationSchemaPending(errorMessage: string | undefined) {
  return /column installations(?:_[0-9]+)?\.location_(?:latitude|longitude) does not exist/.test(
    errorMessage ?? '',
  )
}