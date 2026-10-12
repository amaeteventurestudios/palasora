// Lucide icon lookup for the shared navigation model (keeps nav.ts serialisable).
import { Activity, Bookmark, Bot, CandlestickChart, Code, Flame, Globe, Hash, HelpCircle, Home, Info, LayoutGrid, LineChart, Lock, MapPin, MessageCircle,
  MessagesSquare, Megaphone, Newspaper, Radio, Send, Shield, Sparkles, Star, Store, Tags, Users, Wallet, Gem, type LucideIcon } from "lucide-react";
const MAP: Record<string, LucideIcon> = { home: Home, flame: Flame, users: Users, radio: Radio, messages: MessagesSquare, bookmark: Bookmark, grid: LayoutGrid,
  "map-pin": MapPin, globe: Globe, tags: Tags, bot: Bot, sparkles: Sparkles, send: Send, message: MessageCircle, wallet: Wallet, "line-chart": LineChart,
  candlestick: CandlestickChart, store: Store, info: Info, shield: Shield, help: HelpCircle, code: Code, lock: Lock, hash: Hash, activity: Activity,
  megaphone: Megaphone, star: Star, gem: Gem, newspaper: Newspaper };
export const iconFor = (k: string): LucideIcon => MAP[k] ?? Hash;
