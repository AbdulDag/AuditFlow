export default function SettingsPage() {
  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#F8FAFC] tracking-tight">Settings</h1>
        <p className="text-sm text-[#64748B] mt-1">Configure your audit preferences and integrations.</p>
      </div>
      <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-6 space-y-6">
        {[
          { label: "Default Execution Timeout", value: "900s", desc: "Maximum time to allow a Docker container to run." },
          { label: "Python Base Image", value: "python:3.11-slim", desc: "Default base image for Docker builds." },
          { label: "arXiv API Key", value: "••••••••••••••", desc: "Used to bypass rate limiting on bulk audits." },
          { label: "Webhook URL", value: "https://", desc: "POST notification when an audit completes." },
        ].map(({ label, value, desc }) => (
          <div key={label} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-6 border-b border-[#1E293B] last:border-0 last:pb-0">
            <div>
              <p className="text-sm font-medium text-[#F8FAFC]">{label}</p>
              <p className="text-xs text-[#64748B] mt-0.5">{desc}</p>
            </div>
            <input
              defaultValue={value}
              className="sm:w-56 bg-[#020617] border border-[#334155] rounded-lg px-3 py-2 text-xs text-[#94A3B8] font-mono focus:outline-none focus:border-[#3B82F6] transition-colors"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
