import { Suspense } from "react";
import NurseHome from "@/components/nurse/NurseHome";

export default function NursePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <NurseHome />
    </Suspense>
  );
}
