import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-pv py-16">
      <h1 className="text-3xl font-extrabold">We couldn&apos;t find that page.</h1>
      <p className="mt-2 text-muted-foreground">It may have moved or is no longer public.</p>
      <Link href="/" className="btn btn-primary mt-6">Explore conversations</Link>
    </div>
  );
}
