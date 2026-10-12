// ISSUE-28 African trivia: geography, history, science and culture. Every question has one correct answer that is a stable,
// well-documented fact and a public source link. The bank was checked against those sources when it was written (October 2026);
// it has NOT had a separate expert or native-speaker review, and readers can report an error. Pure and deterministic: a match's
// questions and the order of options come from its seed.
export type Question = { id: string; topic: "geography" | "history" | "science" | "culture"; q: string; options: string[]; answer: number; source: string; note?: string };

const W = (p: string) => `https://en.wikipedia.org/wiki/${p}`;
export const BANK: Question[] = [
  { id: "g01", topic: "geography", q: "What is the capital of Nigeria?", options: ["Lagos", "Abuja", "Ibadan", "Kano"], answer: 1, source: W("Abuja"), note: "Abuja replaced Lagos as capital in 1991." },
  { id: "g02", topic: "geography", q: "Which is the longest river in Africa?", options: ["Congo", "Niger", "Nile", "Zambezi"], answer: 2, source: W("Nile") },
  { id: "g03", topic: "geography", q: "What is the highest mountain in Africa?", options: ["Mount Kenya", "Kilimanjaro", "Mount Stanley", "Ras Dashen"], answer: 1, source: W("Mount_Kilimanjaro") },
  { id: "g04", topic: "geography", q: "Which is the largest country in Africa by land area?", options: ["Algeria", "DR Congo", "Sudan", "Libya"], answer: 0, source: W("Algeria") },
  { id: "g05", topic: "geography", q: "Which is the most populous country in Africa?", options: ["Ethiopia", "Egypt", "Nigeria", "DR Congo"], answer: 2, source: W("Demographics_of_Nigeria") },
  { id: "g06", topic: "geography", q: "Which is Africa's largest lake by area?", options: ["Lake Tanganyika", "Lake Victoria", "Lake Malawi", "Lake Chad"], answer: 1, source: W("Lake_Victoria") },
  { id: "g07", topic: "geography", q: "Victoria Falls is on which river?", options: ["Limpopo", "Orange", "Zambezi", "Okavango"], answer: 2, source: W("Victoria_Falls") },
  { id: "g08", topic: "geography", q: "Which is the largest island in Africa?", options: ["Madagascar", "Zanzibar", "Bioko", "Mauritius"], answer: 0, source: W("Madagascar") },
  { id: "g09", topic: "geography", q: "Which narrow strait separates Morocco from Spain?", options: ["Bab-el-Mandeb", "Strait of Gibraltar", "Mozambique Channel", "Strait of Hormuz"], answer: 1, source: W("Strait_of_Gibraltar") },
  { id: "g10", topic: "geography", q: "In which country is the historic city of Timbuktu?", options: ["Niger", "Mali", "Mauritania", "Burkina Faso"], answer: 1, source: W("Timbuktu") },
  { id: "g11", topic: "geography", q: "South Africa has three capital cities. Which of these is NOT one of them?", options: ["Pretoria", "Cape Town", "Johannesburg", "Bloemfontein"], answer: 2, source: W("Capital_of_South_Africa") },
  { id: "g12", topic: "geography", q: "What is the capital of Kenya?", options: ["Mombasa", "Nairobi", "Kisumu", "Nakuru"], answer: 1, source: W("Nairobi") },
  { id: "g13", topic: "geography", q: "What is the capital of Ghana?", options: ["Kumasi", "Tamale", "Accra", "Cape Coast"], answer: 2, source: W("Accra") },
  { id: "g14", topic: "geography", q: "Which African country has Kigali as its capital?", options: ["Burundi", "Uganda", "Rwanda", "Tanzania"], answer: 2, source: W("Kigali") },
  { id: "g15", topic: "geography", q: "Lake Volta, one of the world's largest reservoirs by surface area, is in which country?", options: ["Ghana", "Togo", "Burkina Faso", "Côte d'Ivoire"], answer: 0, source: W("Lake_Volta") },
  { id: "g16", topic: "geography", q: "How many countries in Africa are members of the United Nations?", options: ["48", "52", "54", "56"], answer: 2, source: W("List_of_African_countries"), note: "54 UN member states." },
  { id: "g17", topic: "geography", q: "Which is the second-highest mountain in Africa?", options: ["Mount Kenya", "Mount Elgon", "Mount Meru", "Mount Cameroon"], answer: 0, source: W("Mount_Kenya") },
  { id: "h01", topic: "history", q: "In which year did Nelson Mandela become President of South Africa?", options: ["1990", "1994", "1999", "1989"], answer: 1, source: W("Nelson_Mandela") },
  { id: "h02", topic: "history", q: "Where is the headquarters of the African Union?", options: ["Addis Ababa", "Nairobi", "Abuja", "Johannesburg"], answer: 0, source: W("African_Union") },
  { id: "h03", topic: "history", q: "Who was the first African woman to win the Nobel Peace Prize (2004)?", options: ["Ellen Johnson Sirleaf", "Wangari Maathai", "Leymah Gbowee", "Graça Machel"], answer: 1, source: W("Wangari_Maathai") },
  { id: "h04", topic: "history", q: "Wole Soyinka won the Nobel Prize in Literature in which year?", options: ["1976", "1986", "1996", "2006"], answer: 1, source: W("Wole_Soyinka") },
  { id: "h05", topic: "history", q: "The stone city of Great Zimbabwe is in which present-day country?", options: ["Zambia", "Mozambique", "Zimbabwe", "Botswana"], answer: 2, source: W("Great_Zimbabwe") },
  { id: "h06", topic: "history", q: "The rock-hewn churches of Lalibela are in which country?", options: ["Eritrea", "Ethiopia", "Egypt", "Sudan"], answer: 1, source: W("Rock-hewn_Churches,_Lalibela") },
  { id: "h07", topic: "history", q: "Ngozi Okonjo-Iweala became the first woman and first African to lead which organisation in 2021?", options: ["World Bank", "IMF", "World Trade Organization", "African Development Bank"], answer: 2, source: W("Ngozi_Okonjo-Iweala") },
  { id: "h08", topic: "history", q: "The Great Pyramid of Giza is in which country?", options: ["Sudan", "Egypt", "Libya", "Ethiopia"], answer: 1, source: W("Great_Pyramid_of_Giza") },
  { id: "h09", topic: "history", q: "Which Ghanaian leader led the country to independence in 1957?", options: ["Jerry Rawlings", "Kwame Nkrumah", "John Kufuor", "Kofi Annan"], answer: 1, source: W("Kwame_Nkrumah") },
  { id: "s01", topic: "science", q: "The Mpemba effect (hot water sometimes freezing faster than cold) is named after a student from which country?", options: ["Kenya", "Tanzania", "Uganda", "Malawi"], answer: 1, source: W("Mpemba_effect") },
  { id: "s02", topic: "science", q: "The Aswan High Dam controls the flow of which river?", options: ["Niger", "Nile", "Congo", "Volta"], answer: 1, source: W("Aswan_Dam") },
  { id: "s03", topic: "science", q: "Which African river is often described as the deepest river in the world?", options: ["Congo", "Nile", "Niger", "Orange"], answer: 0, source: W("Congo_River") },
  { id: "s04", topic: "science", q: "The Sahara is the world's largest hot desert. Roughly how large is it?", options: ["About 0.9 million km²", "About 3 million km²", "About 9 million km²", "About 20 million km²"], answer: 2, source: W("Sahara") },
  { id: "s05", topic: "science", q: "Mobile money service M-Pesa was launched in 2007 in which country?", options: ["Nigeria", "Kenya", "South Africa", "Ghana"], answer: 1, source: W("M-Pesa") },
  { id: "c01", topic: "culture", q: "What is the currency of Nigeria?", options: ["Cedi", "Naira", "Rand", "Shilling"], answer: 1, source: W("Nigerian_naira") },
  { id: "c02", topic: "culture", q: "What is the currency of Ghana?", options: ["Cedi", "Dalasi", "Kwacha", "Leone"], answer: 0, source: W("Ghanaian_cedi") },
  { id: "c03", topic: "culture", q: "What is the currency of South Africa?", options: ["Pula", "Rand", "Loti", "Kwanza"], answer: 1, source: W("South_African_rand") },
  { id: "c04", topic: "culture", q: "Kente cloth is most closely associated with which country?", options: ["Ghana", "Kenya", "Senegal", "Ethiopia"], answer: 0, source: W("Kente_cloth") },
  { id: "c05", topic: "culture", q: "'Nollywood' is the film industry of which country?", options: ["Niger", "Nigeria", "Namibia", "Kenya"], answer: 1, source: W("Cinema_of_Nigeria") },
  { id: "c06", topic: "culture", q: "Jollof rice takes its name from the Wolof (Jolof) people and empire of which region?", options: ["East Africa", "Senegambia", "Southern Africa", "the Horn of Africa"], answer: 1, source: W("Jollof_rice") },
  { id: "c07", topic: "culture", q: "An Oware board (abapa rules) has how many pits in play?", options: ["8", "10", "12", "16"], answer: 2, source: W("Oware") },
  { id: "c08", topic: "culture", q: "Kiswahili is an official language of which pair of countries?", options: ["Kenya and Tanzania", "Ghana and Togo", "Egypt and Sudan", "Angola and Namibia"], answer: 0, source: W("Swahili_language") },
  { id: "c09", topic: "culture", q: "Afrobeat, the music style, was pioneered in the 1970s by which Nigerian musician?", options: ["King Sunny Adé", "Fela Kuti", "Burna Boy", "Wizkid"], answer: 1, source: W("Fela_Kuti") },
];

export const TRIVIA_ROUNDS = 10;
export type TriviaState = { qids: string[]; order: number[][]; round: number; answers: [(number | null)[], (number | null)[]]; score: [number, number]; over: boolean; winner: 0 | 1 | "draw" | null; reason: string; toMove: 0 | 1; ply: number };

/** Deterministic PRNG (mulberry32) so a match's questions and option order are reproducible from its seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function triviaInitial(seed: number): TriviaState {
  const r = rng(seed), pool = [...BANK];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const qs = pool.slice(0, TRIVIA_ROUNDS);
  const order = qs.map((q) => { const o = q.options.map((_, i) => i); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; });
  return { qids: qs.map((q) => q.id), order, round: 0, answers: [Array(TRIVIA_ROUNDS).fill(null), Array(TRIVIA_ROUNDS).fill(null)], score: [0, 0], over: false, winner: null, reason: "", toMove: 0, ply: 0 };
}
export const question = (id: string) => BANK.find((q) => q.id === id)!;

/** Both players answer each round (in either order); `choice` is the index in the ORIGINAL options list. The round advances when
 *  both have answered. Answers cannot be changed. toMove is informational only (whoever has not answered yet). */
export function triviaApply(s: TriviaState, side: 0 | 1, choice: number): TriviaState {
  if (s.over || s.answers[side][s.round] !== null) throw new Error("ILLEGAL_MOVE");
  const q = question(s.qids[s.round]);
  if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) throw new Error("ILLEGAL_MOVE");
  const answers: TriviaState["answers"] = [s.answers[0].slice(), s.answers[1].slice()];
  answers[side][s.round] = choice;
  const score: [number, number] = [...s.score] as [number, number];
  if (choice === q.answer) score[side]++;
  let n: TriviaState = { ...s, answers, score, ply: s.ply + 1, toMove: answers[0][s.round] === null ? 0 : 1 };
  if (answers[0][s.round] !== null && answers[1][s.round] !== null) {
    n = { ...n, round: s.round + 1, toMove: 0 };
    if (n.round >= TRIVIA_ROUNDS) n = { ...n, over: true, winner: score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : "draw", reason: `${score[0]}–${score[1]} after ${TRIVIA_ROUNDS} questions` };
  }
  return n;
}

/** An agent's answer: right with a probability set by its knowledge of the topic (from its declared subjects), otherwise a
 *  deterministic wrong option. No model call; the "knowledge" is an honest simulation, labelled as such on the match page. */
export function triviaBot(s: TriviaState, agentSeed: number, skill: Record<string, number>): number {
  const q = question(s.qids[s.round]);
  const r = rng(agentSeed * 31 + s.round * 7 + q.id.charCodeAt(1) * 13)();
  if (r < (skill[q.topic] ?? 0.55)) return q.answer;
  const wrong = q.options.map((_, i) => i).filter((i) => i !== q.answer);
  return wrong[Math.floor(r * 1000) % wrong.length];
}
