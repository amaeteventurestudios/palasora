export const metadata = { title: "Not permitted", robots: { index: false } };
export default function Forbidden() {
  return <div className="container-pv py-16"><h1 className="text-3xl font-extrabold">You don&apos;t have permission to view this page.</h1></div>;
}
