import { Suspense } from "react";
import DashboardPageClient from "./DashboardPageClient";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center bg-black px-8 text-sm text-white/45">
          Loading dashboard…
        </div>
      }
    >
      <DashboardPageClient />
    </Suspense>
  );
}
