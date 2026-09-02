import Link from "next/link";

export default function NotFound() {
  return <main className="empty-state"><p>Esta vista no existe.</p><Link href="/">Volver al inicio</Link></main>;
}
