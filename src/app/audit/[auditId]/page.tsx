import { AuditSession } from "@/components/audit/AuditSession";

export default async function AuditSessionPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
  return <AuditSession auditId={auditId} />;
}
