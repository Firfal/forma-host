"use client";

import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronsUpDown,
  GraduationCap,
  House,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquare,
  MessagesSquare,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import { useStudentConversations, useUnreadConversations } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { useCreator } from "@/lib/creator";
import { useSchool, useSchoolDocs } from "@/lib/school";

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
  { href: routes.adminMessages, label: "Messages", icon: MessagesSquare },
  { href: routes.adminComments, label: "Commentaires", icon: MessageSquare },
  { href: routes.adminSettings, label: "Paramètres", icon: Settings },
];

const memberNav: NavItem[] = [
  { href: routes.myCourses, label: "Mes formations", icon: LayoutGrid },
];

const studentMessagesNav: NavItem = {
  href: routes.messages,
  label: "Messages",
  icon: MessagesSquare,
};

const becomeCreatorNav: NavItem = {
  href: routes.becomeCreator,
  label: "Devenir formateur",
  icon: GraduationCap,
};

const platformNav: NavItem[] = [
  { href: routes.platformRequests, label: "Demandes formateurs", icon: ShieldCheck },
];

function NavLink({
  item,
  onNavigate,
  badge,
}: {
  item: NavItem;
  onNavigate: () => void;
  /** Nombre affiché à droite (ex. conversations non lues). */
  badge?: number;
}) {
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
      {badge ? (
        <span
          className="ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[11px] font-semibold text-white"
          aria-label={`${badge} non lu${badge > 1 ? "s" : ""}`}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function SchoolLogo({ logoUrl, size }: { logoUrl: string | null | undefined; size: number }) {
  return logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      className="shrink-0 rounded-md object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <LogoMark size={size} />
  );
}

/** Formateur : nom et logo de l'école active ; élève : nom de la plateforme. */
function SidebarBrand({ size }: { size: number }) {
  const { isCreator } = useAuth();
  const { schoolId } = useSchool();
  const { data: school } = useCreator(isCreator ? schoolId : null);
  return (
    <>
      <SchoolLogo logoUrl={school?.logoUrl} size={size} />
      <span className="truncate text-sm font-semibold">{school?.name ?? brand.name}</span>
    </>
  );
}

/** Sélecteur d'école, pour qui administre plusieurs écoles. */
function SchoolSwitcher({ onNavigate }: { onNavigate: () => void }) {
  const { schoolId, schools, setSchoolId } = useSchool();
  const { data: docs } = useSchoolDocs(schools);
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-black/5"
        aria-label="Changer d'école"
      >
        <SidebarBrand size={26} />
        <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {docs.map((school) => (
          <DropdownMenuItem
            key={school.id}
            onSelect={() => {
              setSchoolId(school.id);
              onNavigate();
              router.push(routes.admin);
            }}
          >
            <SchoolLogo logoUrl={school.logoUrl} size={18} />
            <span className="flex-1 truncate">{school.name}</span>
            {school.id === schoolId ? <Check /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  const { user, isCreator, isPlatformAdmin, signOut } = useAuth();
  const { schoolId, schools } = useSchool();
  const displayName = user?.displayName || user?.email || "";
  const schoolUnread = useUnreadConversations("school", isCreator ? schoolId : null);
  const studentUnread = useUnreadConversations("student", user?.uid);
  // Formateur : « Messages » côté élève seulement s'il écrit lui-même à une autre école.
  const { data: studentConversations } = useStudentConversations(isCreator ? user?.uid : undefined);
  const showStudentMessages = !isCreator || studentConversations.length > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pb-4 pt-4">
        {isCreator && schools.length > 1 ? (
          <SchoolSwitcher onNavigate={onNavigate} />
        ) : (
          <SidebarBrand size={26} />
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2" aria-label="Navigation principale">
        {isCreator ? (
          <div>
            <p className="px-2 pb-1 text-[12px] font-medium text-muted">Admin</p>
            <div className="space-y-0.5">
              {adminNav.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  onNavigate={onNavigate}
                  badge={item.href === routes.adminMessages ? schoolUnread : undefined}
                />
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
            {showStudentMessages ? (
              <NavLink item={studentMessagesNav} onNavigate={onNavigate} badge={studentUnread} />
            ) : null}
            {isCreator ? null : <NavLink item={becomeCreatorNav} onNavigate={onNavigate} />}
          </div>
        </div>
        {isPlatformAdmin ? (
          <div>
            <p className="px-2 pb-1 text-[12px] font-medium text-muted">Plateforme</p>
            <div className="space-y-0.5">
              {platformNav.map((item) => (
                <NavLink key={item.href} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ) : null}
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
        <SidebarBrand size={22} />
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
