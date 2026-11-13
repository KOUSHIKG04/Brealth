"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AppSidebar } from "./app-sidebar";
import { navItems, sidebarWidthLimits } from "./utils/sidebarConstants";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@startup/web-ui/components/ui/sidebar";
import { Separator } from "@startup/web-ui/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@startup/web-ui/components/ui/breadcrumb";

export function AdminLayout({
  children,
  facilityName,
  userName,
  logoutAction,
}: {
  children: React.ReactNode;
  facilityName: string;
  userName: string;
  logoutAction: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = React.useState(
    sidebarWidthLimits.initial
  );
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTitle =
    pathname === "/doctor-management" &&
    searchParams.get("tab") === "notifications"
      ? "Notifications"
      : (navItems
          .flatMap((item) => item.items ?? [item])
          .find((item) => pathname === item.url)?.title ??
        (pathname.startsWith("/doctor-schedules/")
          ? "Doctor Schedule"
          : "Facility portal"));
  return (
    <SidebarProvider
      className="[&_[data-slot=sidebar-container]]:transition-none [&_[data-slot=sidebar-gap]]:transition-none"
      defaultOpen
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <AppSidebar
        facilityName={facilityName}
        userName={userName}
        logoutAction={logoutAction}
        sidebarWidth={sidebarWidth}
        onSidebarWidthChange={setSidebarWidth}
      />
      <SidebarInset className="bg-background min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 motion-reduce:transition-none">
          <div className="flex min-w-0 items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink asChild>
                    <Link href="/">Facility portal</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{currentTitle}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="min-w-0 flex-1 p-4 pt-0 md:p-6 md:pt-0">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
