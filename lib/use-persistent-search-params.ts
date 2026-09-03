'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

import { applySearchParamUpdates, type SearchParamUpdates } from './search-params'

export function usePersistentSearchParams() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  return useCallback(
    (updates: SearchParamUpdates) => {
      const query = applySearchParamUpdates(searchParams.toString(), updates)
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )
}