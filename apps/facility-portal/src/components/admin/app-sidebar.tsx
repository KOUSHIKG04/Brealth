"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, HeartPulse } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@startup/web-ui/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  useSidebar,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@startup/web-ui/components/ui/sidebar";
import { SidebarResizeRail } from "./sidebar-resize-rail";
import { NavUser } from "./nav-user";

import { navItems } from "./utils/sidebarConstants";

export function AppSidebar({
  facilityName,
  userName,
  logoutAction,
  sidebarWidth,
  onSidebarWidthChange,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  facilityName: string;
  userName: string;
  logoutAction: React.ReactNode;
  sidebarWidth: number;
  onSidebarWidthChange: (width: number) => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const notificationsActive =
    pathname === "/doctor-management" &&
    searchParams.get("tab") === "notifications";
  const { state, setOpen, setOpenMobile } = useSidebar();
  const [scheduleOpen, setScheduleOpen] = React.useState(true);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={facilityName}>
              <Link href="/" onClick={() => setOpenMobile(false)}>
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg">
                  <HeartPulse className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{facilityName}</span>
                  <span className="truncate text-xs">Facility portal</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Facility</SidebarGroupLabel>
          <SidebarMenu>
            {navItems.map((item) => {
              const isActive =
                item.title === "Notifications"
                  ? notificationsActive
                  : !notificationsActive &&
                    item.matchUrls.some(
                      (url) =>
                        pathname === url ||
                        (url !== "/" && pathname.startsWith(`${url}/`))
                    );
              const Icon = item.icon;

              if ("items" in item && item.items)
                return (
                  <Collapsible
                    key={item.title}
                    asChild
                    open={scheduleOpen}
                    onOpenChange={setScheduleOpen}
                    className="group/schedule"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          tooltip={item.title}
                          isActive={isActive}
                          onClick={(event) => {
                            if (state === "collapsed") {
                              event.preventDefault();
                              setOpen(true);
                              setScheduleOpen(true);
                            }
                          }}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span>{item.title}</span>
                          <ChevronRight className="ml-auto size-4 transition-transform group-data-[state=open]/schedule:rotate-90 motion-reduce:transition-none" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.items.map((child) => {
                            const active =
                              !notificationsActive &&
                              (pathname === child.url ||
                                pathname.startsWith(`${child.url}/`));
                            const ChildIcon = child.icon;
                            return (
                              <SidebarMenuSubItem key={child.url}>
                                <SidebarMenuSubButton asChild isActive={active}>
                                  <Link
                                    href={child.url}
                                    onClick={() => setOpenMobile(false)}
                                    aria-current={active ? "page" : undefined}
                                  >
                                    <ChildIcon className="size-4 shrink-0" />
                                    <span>{child.title}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );

              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={item.title}
                  >
                    <Link
                      href={item.url}
                      onClick={() => setOpenMobile(false)}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon />
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser
          user={{ name: "Facility admin", email: userName }}
          logoutAction={logoutAction}
        />
      </SidebarFooter>
      <SidebarResizeRail
        width={sidebarWidth}
        onWidthChange={onSidebarWidthChange}
      />
    </Sidebar>
  );
}
