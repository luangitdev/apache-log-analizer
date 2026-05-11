import { useParams } from "wouter";
import {
  useGetAppPatterns,
  useGetAppPages,
  getGetAppPatternsQueryKey,
  getGetAppPagesQueryKey,
} from "@workspace/api-client-react";
import { useSession } from "../hooks/use-session";
import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
} from "recharts";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatHour(h: number) {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

function HeatmapGrid({
  cells,
}: {
  cells: { dayOfWeek: number; hour: number; requestCount: number }[];
}) {
  const maxVal = useMemo(() => Math.max(...cells.map((c) => c.requestCount), 1), [cells]);
  const cellMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of cells) {
      m[`${c.dayOfWeek}-${c.hour}`] = c.requestCount;
    }
    return m;
  }, [cells]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="flex ml-10 mb-1">
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className="flex-1 text-center text-[10px] text-muted-foreground"
              style={{ minWidth: 28 }}
            >
              {h % 3 === 0 ? formatHour(h) : ""}
            </div>
          ))}
        </div>
        {DAYS.map((day, dow) => (
          <div key={dow} className="flex items-center mb-1">
            <div className="w-10 text-xs text-muted-foreground text-right pr-2 shrink-0">{day}</div>
            {Array.from({ length: 24 }, (_, h) => {
              const val = cellMap[`${dow}-${h}`] ?? 0;
              const intensity = val / maxVal;
              const alpha = intensity === 0 ? 0.05 : 0.15 + intensity * 0.85;
              return (
                <div
                  key={h}
                  className="flex-1 rounded-sm cursor-default group relative"
                  style={{
                    minWidth: 28,
                    height: 28,
                    backgroundColor: `rgba(99, 102, 241, ${alpha})`,
                    margin: "1px",
                  }}
                  title={`${day} ${formatHour(h)}: ${val.toLocaleString()} requests`}
                >
                  {val > 0 && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-card border border-border rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none shadow-md">
                      <span className="font-semibold">{val.toLocaleString()}</span> reqs
                      <br />
                      <span className="text-muted-foreground">
                        {day} {formatHour(h)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <div className="flex items-center gap-2 mt-3 ml-10">
          <span className="text-xs text-muted-foreground">Less</span>
          <div className="flex gap-0.5">
            {[0.05, 0.2, 0.4, 0.6, 0.8, 1].map((a) => (
              <div
                key={a}
                className="w-5 h-4 rounded-sm"
                style={{ backgroundColor: `rgba(99, 102, 241, ${a})` }}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">More</span>
        </div>
      </div>
    </div>
  );
}

export default function AppDetail() {
  const { name } = useParams<{ name: string }>();
  const appName = decodeURIComponent(name ?? "");
  const { sessionId } = useSession();
  const [hourRange, setHourRange] = useState([0, 23]);

  const { data: patterns, isLoading: patternsLoading } = useGetAppPatterns(
    appName,
    { sessionId },
    { query: { queryKey: getGetAppPatternsQueryKey(appName, { sessionId }) } }
  );

  const { data: pages, isLoading: pagesLoading } = useGetAppPages(
    appName,
    { sessionId, hourFrom: hourRange[0], hourTo: hourRange[1], limit: 30 },
    {
      query: {
        queryKey: getGetAppPagesQueryKey(appName, {
          sessionId,
          hourFrom: hourRange[0],
          hourTo: hourRange[1],
          limit: 30,
        }),
      },
    }
  );

  const peakHour = useMemo(() => {
    if (!patterns?.hourlyTotals?.length) return null;
    return patterns.hourlyTotals.reduce((a, b) => (a.requestCount > b.requestCount ? a : b));
  }, [patterns]);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-mono">{appName}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Application usage patterns</p>
        </div>
      </div>

      {peakHour && (
        <div className="flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-lg">
          <Clock className="h-5 w-5 text-primary shrink-0" />
          <p className="text-sm">
            Peak traffic typically occurs around{" "}
            <span className="font-semibold text-primary">{formatHour(peakHour.hour)}</span> with{" "}
            <span className="font-semibold">{peakHour.requestCount.toLocaleString()}</span> requests
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Usage Heatmap</CardTitle>
          <CardDescription>Day of week vs. hour of day — reveals recurring usage windows</CardDescription>
        </CardHeader>
        <CardContent>
          {patternsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : patterns?.heatmap && patterns.heatmap.length > 0 ? (
            <HeatmapGrid cells={patterns.heatmap} />
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              No heatmap data available
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Requests by Hour of Day</CardTitle>
          <CardDescription>Aggregated across all days — shows the typical daily rhythm</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[240px]">
            {patternsLoading ? (
              <Skeleton className="h-full w-full" />
            ) : patterns?.hourlyTotals && patterns.hourlyTotals.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={Array.from({ length: 24 }, (_, h) => {
                    const match = patterns.hourlyTotals.find((t) => t.hour === h);
                    return { hour: formatHour(h), requestCount: match?.requestCount ?? 0 };
                  })}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <XAxis
                    dataKey="hour"
                    style={{ fontSize: "11px", fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    interval={2}
                  />
                  <YAxis
                    style={{ fontSize: "11px", fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "var(--color-card)",
                      borderColor: "var(--color-border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [value.toLocaleString(), "Requests"]}
                  />
                  <Bar dataKey="requestCount" radius={[3, 3, 0, 0]}>
                    {Array.from({ length: 24 }, (_, h) => {
                      const match = patterns?.hourlyTotals?.find((t) => t.hour === h);
                      const isPeak = match?.requestCount === peakHour?.requestCount;
                      return (
                        <Cell
                          key={h}
                          fill={isPeak ? "var(--color-primary)" : "rgba(99,102,241,0.4)"}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No hourly data
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Top Pages</CardTitle>
              <CardDescription>
                Most accessed URLs — filter by hour range to see what is active at specific times
              </CardDescription>
            </div>
            <div className="w-full sm:w-72 space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Hour range filter</span>
                <span className="font-mono font-medium text-foreground">
                  {formatHour(hourRange[0])} &ndash; {formatHour(hourRange[1])}
                </span>
              </div>
              <Slider
                min={0}
                max={23}
                step={1}
                value={hourRange}
                onValueChange={setHourRange}
                className="w-full"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {pagesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : pages && pages.length > 0 ? (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead className="text-right w-28">Requests</TableHead>
                    <TableHead className="text-right w-28">Unique IPs</TableHead>
                    <TableHead className="text-right w-28">Avg Size</TableHead>
                    <TableHead className="w-40">Status Codes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.map((page) => (
                    <TableRow key={page.url}>
                      <TableCell className="font-mono text-sm max-w-[300px] truncate">
                        {page.url}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {page.requestCount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {page.uniqueIPs.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">
                        {page.avgBytes !== null && page.avgBytes !== undefined
                          ? page.avgBytes >= 1024
                            ? `${(page.avgBytes / 1024).toFixed(1)} KB`
                            : `${Math.round(page.avgBytes)} B`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {Object.entries(page.statusCodes)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 3)
                            .map(([code, count]) => {
                              const sc = parseInt(code);
                              const variant =
                                sc >= 500
                                  ? "destructive"
                                  : sc >= 400
                                  ? "secondary"
                                  : "outline";
                              return (
                                <Badge key={code} variant={variant} className="text-xs px-1.5 py-0">
                                  {code}
                                </Badge>
                              );
                            })}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-24 text-muted-foreground">
              No pages found for this hour range
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
