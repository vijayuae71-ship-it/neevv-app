'use client';

import React, { useState, useEffect } from 'react';
import { Layout, ProjectRequirements } from '../types';
import { buildArchitecturalPrompt } from '../utils/aiRenderPrompt';
import { Camera, RefreshCw, Download, AlertTriangle, Sparkles, Eye } from 'lucide-react';
import BrandWatermark from './BrandWatermark';

const GEMINI_TOOL = 'conn_98j3zf9n1evdjz6emjb4__remote_http_call';
const RENDER_DIR = '/agent/home/exports/ai_renders';
const GEMINI_API_KEY = 'AIzaSyDkBoNsiNMWeBdriH3_UqTyJovZs6vMdDg';

// Available models in priority order
const MODELS = [
  { id: 'gemini-2.5-flash-image', label: 'Nano Banana' },
  { id: 'gemini-3.1-flash-image-preview', label: 'Nano Banana 2' },
  { id: 'gemini-3-pro-image-preview', label: 'Nano Banana Pro' },
];

const VIEW_ANGLES = [
  { id: 'front-3/4' as const, label: 'Front 3/4', icon: '🏠' },
  { id: 'front-elevation' as const, label: 'Front Elevation', icon: '🏗️' },
  { id: 'rear-3/4' as const, label: 'Rear 3/4', icon: '🔄' },
  { id: 'bird-eye' as const, label: 'Bird Eye', icon: '🦅' },
];

interface Props {
  layout: Layout;
  requirements: ProjectRequirements;
}

interface RenderResult {
  viewAngle: string;
  imageData: string; // base64
  timestamp: number;
}

export const AIRenderView: React.FC<Props> = ({ layout, requirements }) => {
  const [renders, setRenders] = useState<RenderResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<'front-3/4' | 'rear-3/4' | 'front-elevation' | 'bird-eye'>('front-3/4');
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [activeRender, setActiveRender] = useState<RenderResult | null>(null);
  const [progress, setProgress] = useState('');

  // Load cached renders from disk on mount
  useEffect(() => {
    loadCachedRenders();
  }, []);

  async function loadCachedRenders() {
    if (!window.tasklet) return; // Not in Tasklet environment
    try {
      const listResult = await window.tasklet!.runCommand(`ls ${RENDER_DIR}/*.json 2>/dev/null || echo "EMPTY"`);
      const listStr = typeof listResult === 'object' && listResult !== null ? JSON.stringify(listResult) : String(listResult);
      if (listStr.includes('EMPTY')) return;

      const indexContent = await window.tasklet!.readFileFromDisk(`${RENDER_DIR}/index.json`);
      if (indexContent) {
        const cached = JSON.parse(indexContent) as RenderResult[];
        const fixed = cached.map(r => ({
          ...r,
          imageData: r.imageData || `./renders/render_${(r.viewAngle||'').replace(/[\/\\:*?"<>|]/g, '-')}_${r.timestamp}.png`
        }));
        setRenders(fixed);
        if (fixed.length > 0) {
          setActiveRender(fixed[0]);
        }
      }
    } catch {
      // No cached renders yet - that's fine
    }
  }

  async function generateRender() {
    if (!window.tasklet) {
      setError('AI rendering requires the Tasklet environment. Use the API route /api/render for production.');
      return;
    }

    setLoading(true);
    setError(null);
    setProgress('Building architectural prompt...');

    try {
      const prompt = buildArchitecturalPrompt(layout, requirements, selectedView);
      
      setProgress('Calling Gemini AI image generation...');

      await window.tasklet!.runCommand(`mkdir -p ${RENDER_DIR}`);

      const timestamp = Date.now();
      const outputFile = `${RENDER_DIR}/response_${timestamp}.json`;

      const requestBody = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: '16:9' }
        }
      });
      const requestFile = `${RENDER_DIR}/request_${timestamp}.json`;
      await window.tasklet!.writeFileToDisk(requestFile, requestBody);

      const extCurlCmd = `curl -s --max-time 120 -w "\\n__HTTP_STATUS__%{http_code}" ` +
        `-X POST "https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${GEMINI_API_KEY}" ` +
        `-H "Content-Type: application/json" ` +
        `-d @"${requestFile}" ` +
        `-o "${outputFile}"`;
      const curlResult = await window.tasklet!.runTool('run_command', { command: extCurlCmd, timeout: 150 });

      await window.tasklet!.runCommand(`rm -f "${requestFile}"`);

      const curlLog = typeof curlResult === 'object' ? (curlResult as any).log || '' : String(curlResult);
      const statusMatch = curlLog.match(/__HTTP_STATUS__(\d+)/);
      const httpStatus = statusMatch ? parseInt(statusMatch[1]) : 0;

      if (httpStatus === 429) {
        setError('Rate limit reached. Please wait a few minutes and try again.');
        setLoading(false);
        return;
      }
      if (httpStatus !== 200) {
        try {
          const errContent = await window.tasklet!.readFileFromDisk(outputFile);
          const errJson = JSON.parse(errContent || '{}');
          setError(`API Error (${httpStatus}): ${errJson?.error?.message || 'Unknown error'}`);
        } catch {
          setError(`API Error: HTTP ${httpStatus}`);
        }
        setLoading(false);
        return;
      }

      setProgress('Processing AI-generated image...');

      const safeView = selectedView.replace(/[\/\\:*?"<>|]/g, '-');
      const renderFileName = `render_${safeView}_${timestamp}.png`;
      const APP_RENDERS = '/agent/home/apps/architect-engineer/renders';
      const imgPath = `${APP_RENDERS}/${renderFileName}`;
      const extractResult = await window.tasklet!.runCommand(
        `mkdir -p ${APP_RENDERS} && python3 /agent/home/scripts/extract_render.py "${outputFile}" "${imgPath}"`
      );

      let extractInfo: any;
      try {
        extractInfo = JSON.parse(extractResult.log.trim());
      } catch {
        setError('Failed to process AI response.');
        setLoading(false);
        return;
      }

      if (!extractInfo.ok) {
        setError(extractInfo.error || 'No image data in AI response.');
        setLoading(false);
        return;
      }

      await window.tasklet!.runCommand(
        `cp "${imgPath}" "${RENDER_DIR}/render_${safeView}_${timestamp}.png"`
      );

      const newRender: RenderResult = {
        viewAngle: selectedView,
        imageData: `./renders/${renderFileName}`,
        timestamp
      };

      const updatedRenders = [newRender, ...renders.slice(0, 7)];
      setRenders(updatedRenders);
      setActiveRender(newRender);

      await window.tasklet!.writeFileToDisk(
        `${RENDER_DIR}/index.json`,
        JSON.stringify(updatedRenders)
      );

      setProgress('');
    } catch (err: any) {
      console.error('AI Render failed:', err);
      setError(`Generation failed: ${err.message || 'Unknown error'}. Check your Gemini API key and quota.`);
    } finally {
      setLoading(false);
    }
  }

  async function downloadRender() {
    if (!activeRender) return;
    const filename = activeRender.imageData.split('/').pop() || 'render.png';
    try {
      const resp = await fetch(`./renders/${filename}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      window.open(`./renders/${filename}`, '_blank');
    }
  }

  const viewLabel = VIEW_ANGLES.find(v => v.id === selectedView)?.label || selectedView;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 bg-base-200 rounded-lg mb-2 flex-wrap">
        <Sparkles size={16} className="text-warning flex-shrink-0" />
        <span className="text-sm font-semibold text-base-content/70 flex-shrink-0">AI Render</span>
        
        <div className="hidden sm:block divider divider-horizontal mx-1" />
        
        {/* View angle selector */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-base-content/60">View:</span>
          {VIEW_ANGLES.map(v => (
            <button
              key={v.id}
              className={`btn btn-xs ${selectedView === v.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSelectedView(v.id)}
              disabled={loading}
            >
              <span className="hidden sm:inline">{v.icon}</span> {v.label}
            </button>
          ))}
        </div>

        <div className="hidden sm:block divider divider-horizontal mx-1" />

        {/* Model selector */}
        <select
          className="select select-xs select-bordered"
          value={selectedModel}
          onChange={e => setSelectedModel(e.target.value)}
          disabled={loading}
        >
          {MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>

        <div className="flex-1" />

        {/* Generate button */}
        <button
          className="btn btn-sm btn-primary gap-1"
          onClick={generateRender}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="loading loading-spinner loading-xs" />
              Generating...
            </>
          ) : (
            <>
              <Camera size={14} />
              Generate {viewLabel}
            </>
          )}
        </button>

        {activeRender && (
          <button
            className="btn btn-xs btn-ghost"
            onClick={downloadRender}
            title="Download render"
          >
            <Download size={14} />
          </button>
        )}
      </div>

      {/* Main render area */}
      <div className="flex-1 rounded-lg overflow-hidden bg-base-300 min-h-0 relative" style={{ minHeight: '400px' }}>
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-base-300/90">
            <span className="loading loading-spinner loading-lg text-primary mb-4" />
            <p className="text-sm text-base-content/70">{progress || 'Generating AI render...'}</p>
            <p className="text-xs text-base-content/50 mt-2">This may take 15-30 seconds</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-x-0 top-0 z-20 p-3">
            <div className="alert alert-warning shadow-lg">
              <AlertTriangle size={16} />
              <div>
                <p className="text-sm">{error}</p>
                {error.includes('Rate limit') && (
                  <p className="text-xs mt-1 opacity-70">
                    Tip: Enable billing at <a href="https://ai.dev/projects" target="_blank" rel="noopener noreferrer" className="underline">ai.dev/projects</a> for unlimited generations.
                  </p>
                )}
              </div>
              <button className="btn btn-xs btn-ghost" onClick={() => setError(null)}>✕</button>
            </div>
          </div>
        )}

        {activeRender ? (
          <>
            <img
              src={activeRender.imageData}
              alt={`AI Render - ${activeRender.viewAngle}`}
              className="w-full h-full object-contain"
            />
            <BrandWatermark position="top-left" opacity={0.5} width={90} />
          </>
        ) : !loading && (
          <div className="flex flex-col items-center justify-center h-full text-base-content/50">
            <Camera size={48} className="mb-4 opacity-30" />
            <p className="text-lg font-medium">AI Photorealistic Render</p>
            <p className="text-sm mt-2 max-w-md text-center">
              Generate a professional V-Ray quality architectural render from your floor plan using Google Gemini AI.
              Select a view angle and click <strong>Generate</strong>.
            </p>
            <p className="text-xs mt-4 opacity-50">
              Powered by Google Gemini Imagen • Free tier: ~50 images/day
            </p>
          </div>
        )}
      </div>

      {/* Render history thumbnails */}
      {renders.length > 1 && (
        <div className="flex gap-2 mt-2 p-2 bg-base-200 rounded-lg overflow-x-auto">
          <span className="text-xs text-base-content/60 self-center whitespace-nowrap">History:</span>
          {renders.map((r, i) => (
            <button
              key={r.timestamp}
              className={`flex-shrink-0 rounded border-2 overflow-hidden transition-all ${
                activeRender?.timestamp === r.timestamp 
                  ? 'border-primary ring-2 ring-primary/30' 
                  : 'border-base-300 hover:border-base-content/30'
              }`}
              onClick={() => setActiveRender(r)}
              title={`${r.viewAngle} - ${new Date(r.timestamp).toLocaleTimeString()}`}
            >
              {r.imageData ? (
                <img src={r.imageData} alt={r.viewAngle} className="w-16 h-10 object-cover" />
              ) : (
                <div className="w-16 h-10 bg-base-300 flex items-center justify-center">
                  <Eye size={12} className="opacity-30" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
