import { Suspense } from "react";
import ScorecardPageClient from "./ScorecardPageClient";

export default function ScorecardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center p-8 text-sm text-white/45">
          Loading scorecard…
        </div>
      }
    >
      <ScorecardPageClient />
    </Suspense>
  );
}
