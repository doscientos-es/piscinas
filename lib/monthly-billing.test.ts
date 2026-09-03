import { describe, expect, it } from 'vitest'

import {
  getBillingPeriod,
  getBillingPeriodOptions,
  getPreviousBillingPeriod,
  toBillingPeriodValue,
} from './monthly-billing'

describe('monthly billing periods', () => {
  const middleOfMonth = new Date(2026, 8, 19, 14, 30)

  it('normalizes dates to the first day of their month', () => {
    expect(toBillingPeriodValue(getBillingPeriod(middleOfMonth))).toBe('2026-09-01')
    expect(toBillingPeriodValue(getPreviousBillingPeriod(middleOfMonth))).toBe('2026-08-01')
  })

  it('offers the current month followed by earlier accounting periods', () => {
    expect(getBillingPeriodOptions(middleOfMonth, 3).map((option) => option.value)).toEqual([
      '2026-09-01',
      '2026-08-01',
      '2026-07-01',
    ])
  })
})