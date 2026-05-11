import { useGetOverview, useGetTimeline, useGetHeatmap, useGetStatusCodes, useListLogs } from "@workspace/api-client-react";
import { useSession } from "../hooks/use-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Clock, FileText, Server, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis, Cell, Bar, BarChart, PieChart, Pie, Legend } from "recharts";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const COLORS = ['var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)', 'var(--color-chart-4)', 'var(--color-chart-5)'];

export default function Dashboard() {
  const { sessionId } = useSession();
  const { data: logs = [] } = useListLogs({ query: { queryKey: ["/api/logs"] } });
  
  const { data: overview, isLoading: overviewLoading } = useGetOverview(
    { sessionId }, 
    { query: { queryKey: ["/api/stats/overview", { sessionId }] } }
  );
  
  const { data: timeline } = useGetTimeline(
    { sessionId, granularity: "hour" },
    { query: { queryKey: ["/api/stats/timeline", { sessionId, granularity: "hour" }] } }
  );

  const { data: statusCodes } = useGetStatusCodes(
    { sessionId },
    { query: { queryKey: ["/api/stats/status-codes", { sessionId }] } }
  );

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)]">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-6">
          <Activity className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Welcome to LogVision</h2>
        <p className="text-muted-foreground mb-8 text-center max-w-md">
          Upload an Apache access log file to start analyzing your traffic patterns, identifying peak usage times, and monitoring application health.
        </p>
        <Button asChild size="lg">
          <Link href="/upload">Upload First Log File</Link>
        </Button>
      </div>
    );
  }

  if (overviewLoading || !overview) return <div className="p-8">Loading dashboard...</div>;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1">Global statistics across all parsed log data.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.totalRequests.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Avg {overview.avgRequestsPerHour.toLocaleString(undefined, {maximumFractionDigits: 1})}/hr
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique IPs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.uniqueIPs.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Applications</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.totalApps.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Pages</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.totalPages.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle>Traffic Timeline</CardTitle>
            <CardDescription>Request volume over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {timeline && timeline.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeline} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                    <XAxis 
                      dataKey="timestamp" 
                      tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, {month: 'short', day: 'numeric', hour: '2-digit'})}
                      style={{ fontSize: '12px', fill: 'var(--color-muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                      dy={10}
                    />
                    <YAxis 
                      style={{ fontSize: '12px', fill: 'var(--color-muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : val}
                    />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                      labelFormatter={(val) => new Date(val).toLocaleString()}
                    />
                    <Area type="monotone" dataKey="requestCount" stroke="var(--color-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorRequests)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">No timeline data available</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Status Codes</CardTitle>
            <CardDescription>Response distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {statusCodes && statusCodes.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusCodes}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="count"
                      nameKey="statusCode"
                    >
                      {statusCodes.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={
                          entry.statusCode >= 500 ? 'var(--color-destructive)' : 
                          entry.statusCode >= 400 ? 'var(--color-chart-3)' : 
                          entry.statusCode >= 300 ? 'var(--color-chart-4)' : 
                          'var(--color-chart-2)'
                        } />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                      formatter={(value: number, name: string) => [value.toLocaleString(), `Status ${name}`]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">No status code data</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
