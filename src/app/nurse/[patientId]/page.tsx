import CheckinForm from "./CheckinForm";

export default async function NurseCheckinPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  return <CheckinForm patientId={patientId} />;
}
