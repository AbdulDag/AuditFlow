import { Suspense } from "react";
import PaperChatClient from "./PaperChatClient";
import SideNav from "@/components/SideNav";
import TopNav from "@/components/TopNav";

export default function PaperChatPage() {
  return (
    <div className="flex min-h-screen bg-black">
      <SideNav />
      <div className="ml-60 flex min-h-screen flex-1 flex-col">
        <TopNav />
        <main className="flex-1 pt-14">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-white/45">
                Loading…
              </div>
            }
          >
            <PaperChatClient />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
