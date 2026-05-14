import {
  useGetHeatmap,
  useGetGlobalPages,
  getGetHeatmapQueryKey,
  getGetGlobalPagesQueryKey,
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
import { Skeleton } from "@/components/ui/skeleton";
import { MoonStar, Clock } from "lucide-react";
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
    for (const c of cells) m[`${c.dayOfWeek}-${c.hour}`] = c.requestCount;
    return m;
  }, [cells]);

  // Find dead slots — hour×day combinations with zero or minimal traffic
  const totalSlots = 7 * 24;
  const emptySlots = Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: 24 }, (_, h) => ({ day: d, hour: h, val: cellMap[`${d}-${h}`] ?? 0 }))
  )
    .flat()
    .filter((s) => s.val === 0).length;
  const deadPct = Math.round((emptySlots / totalSlots) * 100);

  return (
    <div className="space-y-4">
      {emptySlots > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 border border-border rounded-lg text-sm">
          <MoonStar className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{emptySlots}</span> of {totalSlots} slots ({deadPct}%) têm tráfego zero — janelas onde nenhum cliente acessa o sistema.
          </span>
        </div>
      )}
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
                const alpha = val === 0 ? 0 : 0.15 + intensity * 0.85;
                const isEmpty = val === 0;
                return (
                  <div
                    key={h}
                    className="flex-1 rounded-sm cursor-default group relative"
                    style={{
                      minWidth: 28,
                      height: 28,
                      backgroundColor: isEmpty
                        ? "rgba(239,68,68,0.12)"
                        : `rgba(99, 102, 241, ${alpha})`,
                      margin: "1px",
                      outline: isEmpty ? "1px dashed rgba(239,68,68,0.3)" : "none",
                    }}
                    title={
                      isEmpty
                        ? `${day} ${formatHour(h)}: sem tráfego`
                        : `${day} ${formatHour(h)}: ${val.toLocaleString()} requests`
                    }
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-card border border-border rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none shadow-md">
                      {isEmpty ? (
                        <span className="text-red-500 font-medium">Sem tráfego</span>
                      ) : (
                        <>
                          <span className="font-semibold">{val.toLocaleString()}</span> reqs
                        </>
                      )}
                      <br />
                      <span className="text-muted-foreground">
                        {day} {formatHour(h)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div className="flex items-center gap-4 mt-3 ml-10 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Menos</span>
              <div className="flex gap-0.5">
                {[0.15, 0.3, 0.5, 0.7, 0.85, 1].map((a) => (
                  <div
                    key={a}
                    className="w-5 h-4 rounded-sm"
                    style={{ backgroundColor: `rgba(99, 102, 241, ${a})` }}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">Mais</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-4 rounded-sm"
                style={{ backgroundColor: "rgba(239,68,68,0.12)", outline: "1px dashed rgba(239,68,68,0.4)" }}
              />
              <span className="text-xs text-red-500">Sem tráfego</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GlobalOverview() {
  const { sessionId } = useSession();
  const [hourRange, setHourRange] = useState([0, 23]);

  const { data: heatmapCells = [], isLoading: heatmapLoading } = useGetHeatmap(
    { sessionId },
    { query: { queryKey: getGetHeatmapQueryKey({ sessionId }) } }
  );

  const { data: pages = [], isLoading: pagesLoading } = useGetGlobalPages(
    { sessionId, hourFrom: hourRange[0], hourTo: hourRange[1], limit: 30 },
    {
      query: {
        queryKey: getGetGlobalPagesQueryKey({
          sessionId,
          hourFrom: hourRange[0],
          hourTo: hourRange[1],
          limit: 30,
        }),
      },
    }
  );

  // Derive hourly totals from heatmap data (sum across all days per hour)
  const hourlyTotals = useMemo(() => {
    const byHour: Record<number, number> = {};
    for (const cell of heatmapCells) {
      byHour[cell.hour] = (byHour[cell.hour] ?? 0) + cell.requestCount;
    }
    return Array.from({ length: 24 }, (_, h) => ({ hour: h, requestCount: byHour[h] ?? 0 }));
  }, [heatmapCells]);

  const peakHour = useMemo(() => {
    if (!hourlyTotals.length) return null;
    return hourlyTotals.reduce((a, b) => (a.requestCount > b.requestCount ? a : b));
  }, [hourlyTotals]);

  // Dead hours: hours with zero traffic across all days
  const deadHours = useMemo(
    () => hourlyTotals.filter((h) => h.requestCount === 0),
    [hourlyTotals]
  );

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Visão Global</h1>
        <p className="text-muted-foreground mt-1">
          Padrões de uso de todas as aplicações combinadas — identifique horários e dias sem tráfego.
        </p>
      </div>

      {/* Insights bar */}
      <div className="flex flex-wrap gap-3">
        {peakHour && (
          <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-lg text-sm">
            <Clock className="h-4 w-4 text-primary shrink-0" />
            <span>
              Pico global às{" "}
              <span className="font-semibold text-primary">{formatHour(peakHour.hour)}</span>
              {" — "}
              <span className="font-semibold">{peakHour.requestCount.toLocaleString()}</span> reqs acumuladas
            </span>
          </div>
        )}
        {deadHours.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm">
            <MoonStar className="h-4 w-4 text-red-500 shrink-0" />
            <span>
              <span className="font-semibold text-red-500">{deadHours.length}</span> hora{deadHours.length !== 1 ? "s" : ""} sem nenhum acesso:{" "}
              <span className="font-mono text-xs text-muted-foreground">
                {deadHours.map((h) => formatHour(h.hour)).join(", ")}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Heatmap Global — Dia × Hora</CardTitle>
          <CardDescription>
            Intensidade de requisições por dia da semana e hora do dia, todas as aplicações somadas. Células em vermelho indicam janelas sem tráfego.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {heatmapLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : heatmapCells.length > 0 ? (
            <HeatmapGrid cells={heatmapCells} />
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              Nenhum dado disponível
            </div>
          )}
        </CardContent>
      </Card>

      {/* Requests by hour */}
      <Card>
        <CardHeader>
          <CardTitle>Requests by Hour of Day</CardTitle>
          <CardDescription>
            Volume total por hora (todas as aplicações, todos os dias) — barras ausentes indicam horários sem tráfego
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[240px]">
            {heatmapLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={hourlyTotals.map((t) => ({
                    hour: formatHour(t.hour),
                    requestCount: t.requestCount,
                    dead: t.requestCount === 0,
                  }))}
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
                    formatter={(value: number, _name: string, entry) => {
                      if (entry?.payload?.dead) return ["Sem tráfego", ""];
                      return [value.toLocaleString(), "Requests"];
                    }}
                  />
                  <Bar dataKey="requestCount" radius={[3, 3, 0, 0]} minPointSize={2}>
                    {hourlyTotals.map((t, h) => {
                      const isPeak = t.requestCount === peakHour?.requestCount && t.requestCount > 0;
                      const isDead = t.requestCount === 0;
                      return (
                        <Cell
                          key={h}
                          fill={
                            isDead
                              ? "rgba(239,68,68,0.25)"
                              : isPeak
                              ? "var(--color-primary)"
                              : "rgba(99,102,241,0.4)"
                          }
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Top Pages global */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Top Pages — Todas as Aplicações</CardTitle>
              <CardDescription>
                URLs mais acessadas em todo o sistema, com filtro por faixa de hora
              </CardDescription>
            </div>
            <div className="w-full sm:w-72 space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Filtro de hora</span>
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
          ) : pages.length > 0 ? (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead className="text-right w-28">Requests</TableHead>
                    <TableHead className="text-right w-28">IPs Únicos</TableHead>
                    <TableHead className="text-right w-28">Avg Size</TableHead>
                    <TableHead className="w-40">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.map((page) => (
                    <TableRow key={page.url}>
                      <TableCell className="font-mono text-sm max-w-[340px] truncate">
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
                                  {code}×{(count as number).toLocaleString()}
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
              Nenhuma página encontrada para este horário
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
