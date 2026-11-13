"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, ChevronsUpDown } from "lucide-react";
import { Avatar, AvatarFallback } from "@startup/web-ui/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@startup/web-ui/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@startup/web-ui/components/ui/sidebar";

export function NavUser({
  user,
  logoutAction,
}: {
  user: { name: string; email: string };
  logoutAction: ReactNode;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const initials = user.email.slice(0, 2).toUpperCase();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={user.email}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 shrink-0 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="grid gap-1 px-2 py-2 font-normal">
              <span className="text-sm font-medium">{user.name}</span>
              <span
                className="text-muted-foreground truncate text-xs"
                title={user.email}
              >
                {user.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href="/doctor-management?tab=notifications"
                onClick={() => setOpenMobile(false)}
              >
                <Bell />
                Notifications
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <SidebarMenuItem className="[&_button]:h-8 [&_button]:text-sm">
        {logoutAction}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
