import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="empty-state">
      <p>Aquesta vista no existeix.</p>
      <Link href="/">Torna a l'inici</Link>
    </main>
  )
}
