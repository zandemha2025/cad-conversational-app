/**
 * PartUpload — drag-and-drop zone for uploading STEP/STL/OBJ files.
 * After upload the AI designs a fixture around the uploaded part.
 */
import { useState, useRef, useCallback } from 'react';
import { Upload, FileBox, X, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { uploadPartFile } from '../../lib/api';
import type { UploadPartResult } from '../../lib/api';

interface PartUploadProps {
  projectId?: string;
  onUploadComplete?: (result: UploadPartResult) => void;
}

export default function PartUpload({ projectId, onUploadComplete }: PartUploadProps) {
  const [isDragging, setIsDragging]   = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploaded, setUploaded]       = useState<UploadPartResult | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const fileInputRef                  = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['step', 'stp', 'stl', 'obj'].includes(ext)) {
      setError('Only STEP, STL, or OBJ files accepted');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('File must be under 50 MB');
      return;
    }
    if (!projectId) {
      setError('No project selected');
      return;
    }
    setError(null);
    setIsUploading(true);
    try {
      const result = await uploadPartFile(projectId, file);
      if (result) {
        setUploaded(result);
        onUploadComplete?.(result);
      } else {
        setError('Upload failed — check your connection and try again');
      }
    } catch {
      setError('Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [projectId, onUploadComplete]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // Uploaded state — compact success card
  if (uploaded) {
    return (
      <div className="mx-3 mb-2 flex items-center gap-2 px-2.5 py-2 bg-emerald-900/20 border border-emerald-700/40 rounded-lg">
        <CheckCircle size={13} className="text-emerald-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-emerald-300 truncate">{uploaded.file_name}</p>
          {uploaded.ai_description && (
            <p className="text-xs text-slate-400 leading-tight truncate">{uploaded.ai_description}</p>
          )}
        </div>
        <button
          title="Remove uploaded part"
          onClick={() => setUploaded(null)}
          className="text-slate-500 hover:text-slate-300 shrink-0 transition-colors"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  // Default drop zone
  return (
    <div className="mx-3 mb-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`flex items-center gap-2 px-2.5 py-2 border border-dashed rounded-lg transition-colors cursor-pointer ${
          isDragging
            ? 'border-cadblue-500 bg-cadblue-950/30'
            : 'border-cadsurface-600 hover:border-cadsurface-500 bg-cadsurface-900/40 hover:bg-cadsurface-900/70'
        } ${isUploading ? 'cursor-wait pointer-events-none' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".step,.stp,.stl,.obj"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {isUploading ? (
          <Loader2 size={13} className="text-cadblue-400 animate-spin shrink-0" />
        ) : (
          <Upload size={13} className="text-slate-500 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 leading-tight">
            {isUploading ? 'Uploading…' : 'Upload part file'}
          </p>
          <p className="text-xs text-slate-600 leading-tight">
            {isUploading ? 'AI is analysing your part' : 'STEP · STL · OBJ · max 50 MB'}
          </p>
        </div>
        <FileBox size={13} className="text-slate-600 shrink-0" />
      </div>
      {error && (
        <div className="flex items-center gap-1.5 mt-1 px-1">
          <AlertCircle size={11} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
