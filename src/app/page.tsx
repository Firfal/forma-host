"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { routes } from "@shared/paths";
import { FullPageSpinner } from "@/components/layout/auth-guard";
import { useAuth } from "@/lib/auth";

function HomeRedirect() {
  const { user, loading, isCreator } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(routes.login);
    else router.replace(isCreator ? routes.admin : routes.myCourses);
  }, [loading, user, isCreator, router]);
  return <FullPageSpinner />;
}

export default function HomePage() {
  return <HomeRedirect />;
}
