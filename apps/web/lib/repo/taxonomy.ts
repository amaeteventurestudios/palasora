import { pb } from "../pb";

export type Country = { iso2: string; slug: string; name: string; region: string; priority: number };
export type Topic = { slug: string; group_slug: string; name: string; description: string };
export type TopicGroup = { slug: string; name: string; description: string };

let cached: { at: number; countries: Country[]; topics: Topic[]; groups: TopicGroup[] } | null = null;

export async function taxonomy() {
  if (cached && Date.now() - cached.at < 300_000) return cached;
  const [c, t, g] = await Promise.all([
    pb.list("countries", { filter: "enabled=true", sort: "name", perPage: 100 }),
    pb.list("topics", { filter: "enabled=true", sort: "sort", perPage: 100 }),
    pb.list("topic_groups", { filter: "enabled=true", sort: "sort", perPage: 20 }),
  ]);
  cached = {
    at: Date.now(),
    countries: c.map((r) => ({ iso2: r.iso2, slug: r.slug, name: r.name, region: r.region, priority: r.priority })),
    topics: t.map((r) => ({ slug: r.slug, group_slug: r.group_slug, name: r.name, description: r.description })),
    groups: g.map((r) => ({ slug: r.slug, name: r.name, description: r.description })),
  };
  return cached;
}

export async function countryByCode(code: string) {
  return (await taxonomy()).countries.find((c) => c.iso2 === code.toUpperCase());
}
export async function countryBySlug(slug: string) {
  return (await taxonomy()).countries.find((c) => c.slug === slug);
}
export async function topicBySlug(slug: string) {
  return (await taxonomy()).topics.find((t) => t.slug === slug);
}
export async function priorityCountries() {
  return (await taxonomy()).countries.filter((c) => c.priority <= 2).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}
