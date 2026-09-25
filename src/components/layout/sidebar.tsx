"use client";

import {
  BookOpen,
  ChevronDown,
  House,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquare,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { routes } from "@shared/paths";
import { LogoMark } from "@/components/logo";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
}

const adminNav: NavItem[] = [
  { href: routes.admin, label: "Accueil", icon: House, exact: true },
  { href: routes.adminCourses, label: "Formations", icon: BookOpen },
  { href: routes.adminMembers, label: "Membres", icon: Users },
  { href: routes.adminComments, label: "Commentaires", icon: MessageSquare },
];

const memberNav: NavItem[] = [
  { href: routes.myCourses, label: "Mes formations", icon: LayoutGrid },
];

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const pathname = usePathname();
  const active = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-black/5",
        active && "bg-black/[0.07]",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {item.label}
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  const { user, isCreator, signOut } = useAuth();
  const displayName = user?.displayName || user?.email || "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pb-4 pt-4">
        <LogoMark size={26} />
        <span className="truncate text-sm font-semibold">{brand.name}</span>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2" aria-label="Navigation principale">
        {isCreator ? (
          <div>
            <p className="px-2 pb-1 text-[12px] font-medium text-muted">Admin</p>
            <div className="space-y-0.5">
              {adminNav.map((item) => (
                <NavLink key={item.href} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ) : null}
        <div>
          <p className="px-2 pb-1 text-[12px] font-medium text-muted">Espace membre</p>
          <div className="space-y-0.5">
            {memberNav.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      </nav>

      <div className="flex items-center gap-1 border-t border-line/60 p-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-black/5">
            <Avatar name={displayName} src={user?.photoURL} size={26} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{displayName}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            <DropdownMenuItem asChild>
              <Link href="/compte" onClick={onNavigate}>
                <UserRound /> Mon compte
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOut /> Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <NotificationsBell />
      </div>
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      {/* Mobile : barre du haut + tiroir */}
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface px-3 py-2 md:hidden">
        <button
          type="button"
          className="rounded p-1.5 hover:bg-black/5"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
        >
          <Menu className="size-5" />
        </button>
        <LogoMark size={22} />
        <span className="text-sm font-semibold">{brand.name}</span>
      </div>
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-surface shadow-xl">
            <button
              type="button"
              className="absolute right-2 top-3 rounded p-1.5 hover:bg-black/5"
              onClick={() => setOpen(false)}
              aria-label="Fermer le menu"
            >
              <X className="size-4" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}

      {/* Desktop */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-line/60 bg-surface md:block">
        <SidebarContent onNavigate={() => undefined} />
      </aside>
    </>
  );
}
