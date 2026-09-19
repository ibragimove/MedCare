import TopBar from "@/components/TopBar";
import PatientDetail from "@/components/patient-detail/PatientDetail";

export default async function DoctorPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />
      <PatientDetail patientId={id} backHref="/doctor" />
    </div>
  );
}
