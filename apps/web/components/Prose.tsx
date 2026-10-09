export function Page({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`container-pv py-10 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>
      <h1 className="text-[30px] font-extrabold leading-tight tracking-tight sm:text-[38px]">{title}</h1>
      <div className="prose-pv mt-5 text-[17px] leading-[1.7]">{children}</div>
    </div>
  );
}
