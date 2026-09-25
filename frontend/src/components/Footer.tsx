export function Footer() {
  return (
    <footer className="w-full bg-surface-base border-t border-border-crisp py-space-xl">
      <div className="w-full px-space-xl flex flex-col md:flex-row items-center justify-between gap-space-base">
        <div className="flex items-center gap-space-md">
          <span className="font-mono-citation text-mono-citation text-text-muted">
            Problem Statement 26023
          </span>
          <span className="text-border-crisp">|</span>
          <span className="font-body-sm text-body-sm text-text-muted">
            Central Mine Planning and Design Institute (CMPDI)
          </span>
        </div>
        <div className="font-mono-citation text-mono-citation text-text-muted text-center md:text-right">
          © 2025 Ministry of Coal, Government of India. Authorised Personnel
          Only.
        </div>
      </div>
    </footer>
  );
}
