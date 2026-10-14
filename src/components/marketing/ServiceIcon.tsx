import { Briefcase, Clock, Compass, Hand, Heart, Home, ShieldCheck, Sun, Users } from "lucide-react";
import type { Service } from "@/lib/site";

const icons = {
  sun: Sun,
  home: Home,
  users: Users,
  heart: Heart,
  briefcase: Briefcase,
  hand: Hand,
  shield: ShieldCheck,
  clock: Clock,
  compass: Compass,
};

export function ServiceIcon({ icon, className = "h-5 w-5" }: { icon: Service["icon"]; className?: string }) {
  const Icon = icons[icon];
  return <Icon className={className} aria-hidden="true" />;
}
