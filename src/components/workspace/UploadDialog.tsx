import { useState, useCallback, useRef } from 'react';
import { Upload, X, FileBox, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { uploadStepFile, IS_DEMO } from '../../lib/api';
import { useJobPoll } from '../../hooks/useJobPoll';

interface UploadDialogProps {
  projectId: string;
  onClose: () => void;
  onComplete?: (geometryId: string) => void;
}

type Phase = 'idle' | 'uploading' | 'polling' | 'done' | 'error';

export default function UploadDialog({ projectId, onClose, onComplete }: UploadDialogProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [geometryId, setGeometryId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const jobState = useJobPoll(phase === 'polling' ? projectId : null, jobId);

  const handleFile = useCallback((f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['step', 'stp'].includes(ext ?? '')) {
      setErrorMsg('Only .step and .stp files are supported');
      return;
    }
    if (f.size > 200 * 1024 * 1024) {
      setErrorMsg('File exceeds 200 MB limit');
      return;
    }
    setFile(f);
    setErrorMsg(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleUpload = async () => {
    if (!file) return;
    setPhase('uploading');

    if (IS_DEMO) {
      // Simulate upload + processing
      await new Promise(r => setTimeout(r, 800));
      const fakeGeoId = `demo_geo_${Date.now()}`;
      setGeometryId(fakeGeoId);
      setPhase('done');
      onComplete?.(fakeGeoId);
      return;
    }

    const res = await uploadStepFile(projectId, file);
    if (!res) {
      setPhase('error');
      setErrorMsg('Upload failed — check backend connection');
      return;
    }
    setJobId(res.job_id);
    setGeometryId(res.geometry_id);
    setPhase('polling');
  };

  // Watch job poll
  if (phase === 'polling') {
    if (jobState.status === 'done') {
      setPhase('done');
      if (geometryId) onComplete?.(geometryId);
    } else if (jobState.status === 'failed') {
      setPhase('error');
      setErrorMsg('Processing failed on the server');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <FileBox size={18} className="text-blue-400" />
            <h2 className="text-white font-semibold">Import STEP File</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Drop zone */}
        {phase === 'idle' && (
          <div
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              drag ? 'border-blue-400 bg-blue-950/30' : 'border-gray-700 hover:border-gray-500 bg-gray-800/40'
            }`}
          >
            <Upload size={32} className="mx-auto mb-3 text-gray-500" />
            <p className="text-sm text-gray-300 font-medium">
              {file ? file.name : 'Drop your STEP file here'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {file
                ? `${(file.size / 1024 / 1024).toFixed(2)} MB — ready to upload`
                : '.step or .stp · up to 200 MB'
              }
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".step,.stp,.STEP,.STP"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        )}

        {/* Uploading */}
        {(phase === 'uploading' || phase === 'polling') && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 size={36} className="text-blue-400 animate-spin" />
            <div className="text-center">
              <p className="text-white font-medium text-sm">
                {phase === 'uploading' ? 'Uploading to storage…' : 'Processing geometry…'}
              </p>
              <p className="text-gray-500 text-xs mt-1">
                {phase === 'uploading'
                  ? 'Transferring your STEP file to R2'
                  : 'Extracting faces, features, and datums via Open CASCADE'}
              </p>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full animate-pulse"
                style={{ width: phase === 'uploading' ? '40%' : '80%' }}
              />
            </div>
          </div>
        )}

        {/* Done */}
        {phase === 'done' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle size={36} className="text-green-400" />
            <div className="text-center">
              <p className="text-white font-medium text-sm">Geometry imported successfully</p>
              <p className="text-gray-500 text-xs mt-1">
                {IS_DEMO ? 'Demo: geometry simulated. Connect backend for real processing.' : 'Part features extracted and ready for fixture design.'}
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <AlertCircle size={36} className="text-red-400" />
            <div className="text-center">
              <p className="text-white font-medium text-sm">Import failed</p>
              <p className="text-red-400 text-xs mt-1">{errorMsg}</p>
            </div>
          </div>
        )}

        {errorMsg && phase === 'idle' && (
          <p className="text-red-400 text-xs text-center mt-3">{errorMsg}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-5">
          {phase === 'done' ? (
            <button
              onClick={onClose}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              Open in Viewport
            </button>
          ) : phase === 'error' ? (
            <>
              <button
                onClick={() => { setPhase('idle'); setErrorMsg(null); }}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm font-medium py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm font-medium py-2 rounded-lg transition-colors"
                disabled={phase !== 'idle'}
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || phase !== 'idle'}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
              >
                Upload & Process
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
