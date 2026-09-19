import TopBar from "@/components/TopBar";
import PatientDetail from "@/components/patient-detail/PatientDetail";

export default async function ManagerPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />
      <PatientDetail patientId={id} backHref="/manager" />
    </div>
  );
}
