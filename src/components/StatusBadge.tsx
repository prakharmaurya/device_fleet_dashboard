export default function StatusBadge({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
        online ? 'bg-green-900/50 text-green-400' : 'bg-slate-700 text-slate-400'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`}
      />
      {online ? 'Online' : 'Offline'}
    </span>
  )
}
