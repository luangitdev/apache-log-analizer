import { useRef, useState, useCallback } from "react";
import { useListLogs, useDeleteLog, getListLogsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "../hooks/use-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type UploadState = "idle" | "uploading" | "success" | "error";

// 10 MB per chunk — stays well under the Replit reverse-proxy body-size limit
const CHUNK_SIZE = 10 * 1024 * 1024;

export default function UploadLogs() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setSessionId } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [label, setLabel] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const { data: sessions = [] } = useListLogs({ query: { queryKey: getListLogsQueryKey() } });
  const deleteLog = useDeleteLog();

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        setSelectedFile(file);
        if (!label) setLabel(file.name.replace(/\.(log|gz|txt)$/, ""));
      }
    },
    [label]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!label) setLabel(file.name.replace(/\.(log|gz|txt)$/, ""));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadState("uploading");
    setUploadProgress(0);
    setProgressLabel("Preparando...");
    setErrorMessage("");

    const file = selectedFile;
    const sessionLabel = label || file.name;
    const uploadId = crypto.randomUUID();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    try {
      let lastResult: Record<string, unknown> | null = null;

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkText = await file.slice(start, end).text();

        const params = new URLSearchParams({
          uploadId,
          chunkIndex: String(i),
          totalChunks: String(totalChunks),
          filename: file.name,
          label: sessionLabel,
        });

        const res = await fetch(`/api/logs/chunk?${params}`, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: chunkText,
        });

        if (!res.ok) {
          let msg = "Upload failed";
          try {
            const err = await res.json();
            msg = err.error || msg;
          } catch {
            // ignore
          }
          throw new Error(msg);
        }

        lastResult = await res.json();

        // Show progress: uploading phase = 0–85%, finalizing = 85–100%
        const isFinal = i === totalChunks - 1;
        if (isFinal) {
          setUploadProgress(100);
          setProgressLabel("Concluído!");
        } else {
          const pct = Math.round(((i + 1) / totalChunks) * 85);
          setUploadProgress(pct);
          const parsed = (lastResult?.parsedSoFar as number) ?? 0;
          setProgressLabel(
            `Chunk ${i + 1} / ${totalChunks} — ${parsed.toLocaleString()} entradas processadas`
          );
        }
      }

      // lastResult here is the 201 response from the final chunk
      if (lastResult) {
        const result = lastResult;
        setUploadState("success");
        await queryClient.invalidateQueries({ queryKey: getListLogsQueryKey() });
        setSessionId(result.id as number);
        toast({
          title: "Arquivo importado com sucesso",
          description: `${(result.parsedLines as number).toLocaleString()} de ${(result.totalLines as number).toLocaleString()} linhas processadas`,
        });
        setSelectedFile(null);
        setLabel("");
        setUploadProgress(0);
        setProgressLabel("");
        setTimeout(() => setUploadState("idle"), 2500);
      }
    } catch (err: unknown) {
      setUploadState("error");
      setErrorMessage(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const handleDelete = async (id: number) => {
    await deleteLog.mutateAsync({ sessionId: id });
    await queryClient.invalidateQueries({ queryKey: getListLogsQueryKey() });
    toast({ title: "Sessão excluída" });
  };

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload Logs</h1>
        <p className="text-muted-foreground mt-1">
          Upload an Apache access.log file to analyze traffic patterns
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Log File</CardTitle>
          <CardDescription>
            Suporta formato Apache Combined Log (access.log). Sem limite de tamanho — arquivos grandes são enviados em partes automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drop zone */}
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer",
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
              selectedFile && "border-primary/40 bg-primary/5"
            )}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".log,.gz,.txt"
              className="hidden"
              onChange={handleFileChange}
            />
            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="h-10 w-10 text-primary" />
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">{formatSize(selectedFile.size)}</p>
                {selectedFile.size > CHUNK_SIZE && (
                  <p className="text-xs text-muted-foreground">
                    Será enviado em {Math.ceil(selectedFile.size / CHUNK_SIZE)} partes de 10 MB
                  </p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    setLabel("");
                  }}
                >
                  Remover
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="font-medium">Arraste seu arquivo access.log aqui</p>
                  <p className="text-sm text-muted-foreground mt-1">ou clique para selecionar</p>
                </div>
              </div>
            )}
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <Label htmlFor="label">Nome da sessão</Label>
            <Input
              id="label"
              placeholder="ex: producao-maio-2025"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          {/* Progress / status */}
          {uploadState === "uploading" && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progressLabel}</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}
          {uploadState === "success" && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              Upload concluído com sucesso
            </div>
          )}
          {uploadState === "error" && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {errorMessage}
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleUpload}
            disabled={!selectedFile || uploadState === "uploading"}
          >
            {uploadState === "uploading" ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Importar e Processar
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Existing sessions */}
      {sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sessões Importadas</CardTitle>
            <CardDescription>
              {sessions.length} sessão{sessions.length !== 1 ? "ões" : ""} disponível{sessions.length !== 1 ? "eis" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{session.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {session.parsedLines.toLocaleString()} entradas
                      {session.dateFrom && session.dateTo && (
                        <>
                          {" "}
                          &middot;{" "}
                          {new Date(session.dateFrom).toLocaleDateString("pt-BR")} –{" "}
                          {new Date(session.dateTo).toLocaleDateString("pt-BR")}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {session.parsedLines.toLocaleString()} linhas
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(session.id)}
                      disabled={deleteLog.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
