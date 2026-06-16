export default function Loading() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink">
              Tokenizador | Costos
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Costo LLM por comprobantes procesados
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm text-slate-700">
            <div className="h-4 w-4 animate-pulse rounded-full bg-slate-300" />
            Cargando
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-5">
        <div className="mb-5 flex gap-2 border-b border-line">
          <div className="border-b-2 border-teal px-4 py-3 text-sm font-medium text-ink">
            Dashboard
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <aside className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-md border border-line bg-white p-4"
              >
                <div className="mb-3 h-5 w-24 rounded bg-slate-200" />
                <div className="space-y-3">
                  <div className="h-10 rounded-md bg-slate-100" />
                  <div className="h-10 rounded-md bg-slate-100" />
                </div>
              </div>
            ))}
          </aside>

          <section className="space-y-5">
            <div className="grid gap-4 md:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-md border border-line bg-white p-4"
                >
                  <div className="mb-3 h-9 w-9 rounded-md bg-slate-100" />
                  <div className="h-4 w-20 rounded bg-slate-200" />
                  <div className="mt-2 h-6 w-16 rounded bg-slate-100" />
                </div>
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-md border border-line bg-white p-4"
                >
                  <div className="mb-4 h-5 w-40 rounded bg-slate-200" />
                  <div className="h-[280px] rounded-md bg-slate-50" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
