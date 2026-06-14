export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto w-full border-t border-slate-200 bg-white py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 text-sm text-slate-500 md:flex-row">
        <div className="flex flex-col items-center gap-1 md:items-start">
          <p className="font-semibold text-slate-800">&copy; {currentYear} Emotify</p>
          <p className="text-xs text-slate-400">Music Emotion Recognition</p>
        </div>

        <div className="flex gap-8 font-medium">
          <span className="cursor-pointer transition-colors hover:text-emerald-500">
            Prywatność
          </span>
          <span className="cursor-pointer transition-colors hover:text-emerald-500">Regulamin</span>
          <span className="cursor-pointer transition-colors hover:text-emerald-500">Kontakt</span>
        </div>
      </div>
    </footer>
  );
}
