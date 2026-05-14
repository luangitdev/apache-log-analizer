import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useListLogs, useDeleteLog, useListApps, getListLogsQueryKey } from "@workspace/api-client-react";
import { useSession } from "../hooks/use-session";
import { Button } from "./ui/button";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarProvider, SidebarTrigger, SidebarFooter } from "./ui/sidebar";
import { Activity, LayoutDashboard, UploadCloud, Server, Trash2, ChevronDown, Check, Globe } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { sessionId, setSessionId } = useSession();
  const { data: sessions = [] } = useListLogs({ query: { queryKey: getListLogsQueryKey() } });
  const { data: apps = [] } = useListApps({ sessionId }, { query: { queryKey: ["/api/apps", { sessionId }] } });
  const deleteLog = useDeleteLog();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const selectedSession = sessions.find((s) => s.id === sessionId);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar variant="inset" collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-4 py-3">
              <Activity className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg truncate tracking-tight">LogVision</span>
            </div>
            
            <div className="px-2 pb-2">
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                  >
                    {selectedSession ? selectedSession.label : "All Sessions"}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-0">
                  <Command>
                    <CommandInput placeholder="Search sessions..." />
                    <CommandList>
                      <CommandEmpty>No session found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => {
                            setSessionId(null);
                            setOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              sessionId === null ? "opacity-100" : "opacity-0"
                            )}
                          />
                          All Sessions
                        </CommandItem>
                        {sessions.map((session) => (
                          <CommandItem
                            key={session.id}
                            value={session.label}
                            onSelect={() => {
                              setSessionId(session.id);
                              setOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                sessionId === session.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {session.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Overview</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/"}>
                      <Link href="/">
                        <LayoutDashboard className="h-4 w-4" />
                        <span>Dashboard</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/overview"}>
                      <Link href="/overview">
                        <Globe className="h-4 w-4" />
                        <span>Global Overview</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/upload"}>
                      <Link href="/upload">
                        <UploadCloud className="h-4 w-4" />
                        <span>Upload Logs</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {apps.length > 0 && (
              <SidebarGroup>
                <SidebarGroupLabel>Applications</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {apps.map((app) => (
                      <SidebarMenuItem key={app.name}>
                        <SidebarMenuButton asChild isActive={location === `/apps/${encodeURIComponent(app.name)}`}>
                          <Link href={`/apps/${encodeURIComponent(app.name)}`}>
                            <Server className="h-4 w-4" />
                            <span className="truncate">{app.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="border-b h-14 flex items-center px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
            <SidebarTrigger />
          </div>
          <div className="flex-1 p-6 overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
