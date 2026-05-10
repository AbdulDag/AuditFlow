import SideNav from "@/components/SideNav";
import TopNav from "@/components/TopNav";

export default function ScorecardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-black">
      <SideNav />
      <div className="ml-60 flex min-h-screen flex-1 flex-col">
        <TopNav />
        <main className="flex-1 pt-24">{children}</main>
      </div>
    </div>
  );
}
