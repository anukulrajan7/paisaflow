import {
  Briefcase,
  Car,
  Clapperboard,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  Laptop,
  Plane,
  Receipt,
  Shapes,
  ShoppingBag,
  ShoppingBasket,
  Store,
  Tag,
  Undo2,
  Users,
  UtensilsCrossed,
} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';

/** Map of lucide icon names (as stored in the categories table) to components. */
export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  UtensilsCrossed,
  ShoppingBasket,
  Car,
  ShoppingBag,
  Receipt,
  House,
  HeartPulse,
  Clapperboard,
  GraduationCap,
  Plane,
  Users,
  Shapes,
  Briefcase,
  Laptop,
  Store,
  Undo2,
  Gift,
  HandCoins,
};

/** Names offered when creating a custom category. */
export const CATEGORY_ICON_CHOICES: string[] = Object.keys(CATEGORY_ICON_MAP);

export function getCategoryIcon(name: string | null | undefined): LucideIcon {
  if (name && CATEGORY_ICON_MAP[name]) {
    return CATEGORY_ICON_MAP[name];
  }
  return Tag;
}
