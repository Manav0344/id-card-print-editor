"use client";

import dynamic from "next/dynamic";

const IdCardPrintEditor = dynamic(() => import("@/components/IdCardPrintEditor"), {
  ssr: false,
  loading: () => (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto flex min-h-[70vh] max-w-7xl items-center justify-center">
        <div className="glass-card rounded-3xl p-8 text-center">
          <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-lg font-semibold">Loading professional print editor…</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Preparing the 4×5 inch 600 DPI ultra-HD canvas.</p>
        </div>
      </div>
    </main>
  )
});

export default function Page() {
  return <IdCardPrintEditor />;
}
