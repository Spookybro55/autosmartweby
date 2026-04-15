export default function PreviewNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <h1 className="text-2xl font-bold text-slate-900">
        Preview nenalezen
      </h1>
      <p className="mt-2 text-slate-500">
        Požadovaný preview neexistuje nebo byl odstraněn.
      </p>
    </div>
  );
}
