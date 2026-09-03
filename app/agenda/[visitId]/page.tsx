import { DemoApp } from "@/components/demo-app";

export default async function VisitPage({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  return <DemoApp view="parte" visitId={visitId} />;
}