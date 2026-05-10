import SideNav from "@/components/SideNav";
import TopNav from "@/components/TopNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#0D0D0D]">
      <SideNav />
      <div className="flex flex-col flex-1 ml-60 min-h-screen transition-all duration-300">
        <TopNav />
        <main className="flex-1 pt-24">
          {children}
        </main>
      </div>
    </div>
  );
}
