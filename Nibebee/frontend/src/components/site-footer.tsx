export function SiteFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-brand-green text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold">Nibebee</p>
          <p className="text-white/80">Connect. Carry. Delivered.</p>
        </div>
        <p className="text-white/70">
          Subscriptions & add-ons only — no commission on your loads.
        </p>
      </div>
    </footer>
  );
}
