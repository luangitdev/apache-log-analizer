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
  const [errorMessage, setErrorMessage] = useState("");

  const { data: sessions = [] } = useListLogs({ query: { queryKey: getListLogsQueryKey() } });
  const deleteLog = useDeleteLog();

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
      if (!label) setLabel(file.name.replace(/\.(log|gz|txt)$/, ""));
    }
  }, [label]);

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
    setErrorMessage("");

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("label", label || selectedFile.name);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 90));
      }
    };

    xhr.onload = async () => {
      if (xhr.status === 201) {
        setUploadProgress(100);
        setUploadState("success");
        const result = JSON.parse(xhr.responseText);
        await queryClient.invalidateQueries({ queryKey: getListLogsQueryKey() });
        setSessionId(result.id);
        toast({
          title: "Log file uploaded",
          description: `Parsed ${result.parsedLines.toLocaleString()} of ${result.totalLines.toLocaleString()} lines`,
        });
        setSelectedFile(null);
        setLabel("");
        setUploadProgress(0);
        setTimeout(() => setUploadState("idle"), 2000);
      } else {
        setUploadState("error");
        try {
          const err = JSON.parse(xhr.responseText);
          setErrorMessage(err.error || "Upload failed");
        } catch {
          setErrorMessage("Upload failed");
        }
      }
    };

    xhr.onerror = () => {
      setUploadState("error");
      setErrorMessage("Network error during upload");
    };

    xhr.open("POST", "/api/logs");
    xhr.send(formData);
  };

  const handleDelete = async (id: number) => {
    await deleteLog.mutateAsync({ sessionId: id });
    await queryClient.invalidateQueries({ queryKey: getListLogsQueryKey() });
    toast({ title: "Session deleted" });
  };

  const formatSize = (bytes: number) => {
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
            Supports Apache combined log format (access.log). Files up to 200 MB.
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    setLabel("");
                  }}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="font-medium">Drop your access.log file here</p>
                  <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
                </div>
              </div>
            )}
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <Label htmlFor="label">Session label</Label>
            <Input
              id="label"
              placeholder="e.g. production-may-2025"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          {/* Progress / status */}
          {uploadState === "uploading" && (
            <div className="space-y-2">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">
                Uploading and parsing... {uploadProgress}%
              </p>
            </div>
          )}
          {uploadState === "success" && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              Upload complete
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
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload and Parse
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Existing sessions */}
      {sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Uploaded Sessions</CardTitle>
            <CardDescription>{sessions.length} log session{sessions.length !== 1 ? "s" : ""} available</CardDescription>
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
                      {session.parsedLines.toLocaleString()} entries
                      {session.dateFrom && session.dateTo && (
                        <> &middot; {new Date(session.dateFrom).toLocaleDateString()} – {new Date(session.dateTo).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {session.parsedLines.toLocaleString()} lines
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
