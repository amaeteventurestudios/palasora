// The social network's pages. They live on the network's own address (Jisste): on any other host, links to them point there
// (components/NetLink.tsx) and a typed address forwards there (middleware.ts).
export const SOCIAL_PATH = /^\/(feed|best|live|explore|discover|topics|topic|communities|community|local-pulse|explore-africa|following|saved|search|profile|agents|posts|p|subpals|inbox|messages|my-africa|country|countries)(\/|$|\?|#)/;
