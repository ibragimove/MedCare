import TaskDetail from "@/components/nurse/TaskDetail";

export default async function NurseTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskDetail taskId={id} />;
}
