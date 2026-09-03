export function isLocationSchemaPending(errorMessage: string | undefined) {
  return /column installations(?:_[0-9]+)?\.location_(?:latitude|longitude) does not exist/.test(
    errorMessage ?? '',
  )
}

export function isClientExtensionSchemaPending(errorMessage: string | undefined) {
  return /column clients(?:_[0-9]+)?\.(?:trade_name|contact_name|contact_role|contact_email|contact_phone|client_type|billing_frequency|payment_terms_days|active) does not exist/.test(
    errorMessage ?? '',
  )
}
