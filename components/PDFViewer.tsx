'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Dynamically import PDF components to avoid SSR issues
const Document = dynamic(() => import('react-pdf').then(mod => ({ default: mod.Document })), {
  ssr: false,
  loading: () => <Skeleton className="w-[600px] h-[800px]" />
});

const Page = dynamic(() => import('react-pdf').then(mod => ({ default: mod.Page })), {
  ssr: false,
  loading: () => <Skeleton className="w-[600px] h-[800px]" />
});

export interface PDFViewerHandle {
  getCurrentOverlayImage: () => Promise<{ dataUrl: string; width: number; height: number } | null>;
  clearOverlays: () => void;
  // New: snapshot and restore full overlay state (draw layer + text layer + composite)
  getOverlayState: () => Promise<{
    composite?: { dataUrl: string; width: number; height: number } | null;
    draw?: { dataUrl: string; width: number; height: number } | null;
    textHTML: string;
  }>;
  setOverlayState: (state: {
    draw?: { dataUrl: string; width: number; height: number } | null;
    textHTML?: string;
  } | null) => void;
}

interface PDFViewerProps {
  file: File;
  currentPage: number;
  scale: number;
  selectedTool: string;
  onPageChange: (page: number) => void;
  annotations: any[];
  isLoading?: boolean;
  selectedColor?: string;
  theme?: 'classic' | 'modern';
  // New: provide a callback to fetch saved overlay state for a given page
  loadOverlayForPage?: (page: number) => {
    composite?: { dataUrl: string; width: number; height: number } | null;
    draw?: { dataUrl: string; width: number; height: number } | null;
    textHTML?: string;
  } | null;
}

const PDFViewer = forwardRef<PDFViewerHandle, PDFViewerProps>(function PDFViewer({
  file,
  currentPage,
  scale,
  selectedTool,
  onPageChange,
  annotations,
  isLoading = false,
  selectedColor = '#000000',
  theme = 'classic',
  loadOverlayForPage,
}: PDFViewerProps, ref) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageLoading, setPageLoading] = useState<boolean>(true);
  const [rotation, setRotation] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textOverlayRef = useRef<HTMLDivElement | null>(null);
  const pageWrapperRef = useRef<HTMLDivElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  // Selection/drag refs for 'select' tool
  const selectedElRef = useRef<HTMLElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Shape drawing support
  const shapeStartRef = useRef<{x:number;y:number}|null>(null);
  const baseImageDataRef = useRef<ImageData|null>(null);

  // Helper to apply a saved overlay state onto the current page layers
  const applyOverlayState = useCallback((state: { draw?: { dataUrl: string; width: number; height: number } | null; textHTML?: string; } | null) => {
    const canvas = canvasRef.current;
    const overlay = textOverlayRef.current;
    const wrapper = pageWrapperRef.current;
    if (!canvas || !overlay || !wrapper) return;

    // Clear existing
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);

    if (!state) return;

    // Draw layer: scale incoming image to current canvas size
    if (state.draw && state.draw.dataUrl) {
      const img = new Image();
      img.onload = () => {
        const rect = wrapper.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width));
        const h = Math.max(1, Math.floor(rect.height));
        canvas.width = w; canvas.height = h;
        const c = canvas.getContext('2d');
        if (c) {
          c.drawImage(img, 0, 0, w, h);
        }
      };
      img.src = state.draw.dataUrl;
    }

    // Text layer: restore HTML
    if (typeof state.textHTML === 'string') {
      overlay.innerHTML = state.textHTML;
      // ensure restored elements remain editable and pickable
      overlay.querySelectorAll('[data-overlay-item]')?.forEach((el) => {
        (el as HTMLElement).setAttribute('contenteditable', 'true');
        (el as HTMLElement).style.userSelect = 'text';
      });
    }
  }, []);

  // Set up PDF.js worker on client side only
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const { pdfjs } = require('react-pdf');
      // Use local ES module worker (copied to public/pdf.worker.min.mjs)
      // For module workers, set workerPort instead of workerSrc
      (pdfjs as any).GlobalWorkerOptions.workerPort = new Worker('/pdf.worker.min.mjs', { type: 'module' });
    }
  }, []);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageLoading(false);
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('Error loading PDF:', error);
    setPageLoading(false);
  }, []);

  const onPageLoadError = useCallback((error: Error) => {
    console.error('Error loading page:', error);
    setPageLoading(false);
  }, []);

  const handlePrevPage = useCallback(() => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  }, [currentPage, onPageChange]);

  const handleNextPage = useCallback(() => {
    if (currentPage < numPages) {
      onPageChange(currentPage + 1);
    }
  }, [currentPage, numPages, onPageChange]);

  const handleRotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360);
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        handlePrevPage();
        break;
      case 'ArrowRight':
        event.preventDefault();
        handleNextPage();
        break;
      case '+':
      case '=':
        event.preventDefault();
        // Handle zoom in
        break;
      case '-':
        event.preventDefault();
        // Handle zoom out
        break;
      case 'Delete':
      case 'Backspace':
        // Delete selected overlay element in select mode
        if (selectedTool === 'select' && selectedElRef.current) {
          event.preventDefault();
          const el = selectedElRef.current;
          const parent = el.parentElement;
          if (parent) parent.removeChild(el);
          selectedElRef.current = null;
          isDraggingRef.current = false;
        }
        break;
    }
  }, [handlePrevPage, handleNextPage]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Keep overlay sizes in sync when zoom/rotation changes; preserve drawings
  const resizeOverlaysOnPageLoad = useCallback(() => {
    const wrapper = pageWrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    const rect = wrapper.getBoundingClientRect();
    const newW = Math.max(1, Math.floor(rect.width));
    const newH = Math.max(1, Math.floor(rect.height));
    const prevW = canvas.width;
    const prevH = canvas.height;
    if (prevW === newW && prevH === newH) return;
    const temp = document.createElement('canvas');
    temp.width = prevW;
    temp.height = prevH;
    const tctx = temp.getContext('2d');
    if (tctx) tctx.drawImage(canvas, 0, 0);
    canvas.width = newW;
    canvas.height = newH;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(temp, 0, 0, newW, newH);
  }, [scale, rotation]);

  useEffect(() => {
    resizeOverlaysOnPageLoad();
  }, [resizeOverlaysOnPageLoad]);

  // When a page finishes loading, ask parent for any saved overlay state and apply it
  const onPageLoadSuccess = useCallback(() => {
    // First, ensure overlays are sized to the rendered page
    resizeOverlaysOnPageLoad();
    // Then, try to restore any saved overlay state for this page
    if (typeof loadOverlayForPage === 'function') {
      try {
        const state = loadOverlayForPage(currentPage);
        if (state) {
          applyOverlayState(state);
        } else {
          // clear if no state saved
          applyOverlayState(null);
        }
      } catch (e) {
        // noop on restore failure
      }
    }
  }, [applyOverlayState, currentPage, loadOverlayForPage, resizeOverlaysOnPageLoad]);

  useEffect(() => {
    const onResize = () => {
      const wrapper = pageWrapperRef.current;
      const canvas = canvasRef.current;
      if (!wrapper || !canvas) return;
      const rect = wrapper.getBoundingClientRect();
      const newW = Math.max(1, Math.floor(rect.width));
      const newH = Math.max(1, Math.floor(rect.height));
      const prevW = canvas.width;
      const prevH = canvas.height;
      if (prevW === newW && prevH === newH) return;
      const temp = document.createElement('canvas');
      temp.width = prevW;
      temp.height = prevH;
      const tctx = temp.getContext('2d');
      if (tctx) tctx.drawImage(canvas, 0, 0);
      canvas.width = newW;
      canvas.height = newH;
      canvas.style.width = `${newW}px`;
      canvas.style.height = `${newH}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(temp, 0, 0, newW, newH);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const getRelativePos = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const getRelativePosFromEl = (el: HTMLElement | null, e: any) => {
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleCanvasMouseDown = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getRelativePos(e);

    if (selectedTool === 'pen') {
      ctx.strokeStyle = selectedColor;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.moveTo(x, y);
      setIsDrawing(true);
      lastPointRef.current = { x, y };
      // draw a small dot so click without move leaves a mark
      ctx.lineTo(x + 0.01, y + 0.01);
      ctx.stroke();
      return;
    }

    if (selectedTool === 'rectangle' || selectedTool === 'circle' || selectedTool === 'highlight') {
      // take a snapshot for live preview
      baseImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      shapeStartRef.current = { x, y };
      setIsDrawing(true);
      return;
    }
  };

  const handleTextOverlayMouseDown = (e: any) => {
    const overlay = textOverlayRef.current;
    if (!overlay) return;

    // Select mode: pick and drag existing elements
    if (selectedTool === 'select') {
      const target = e.target as HTMLElement;
      // If clicked empty overlay, clear selection
      if (target === overlay) {
        if (selectedElRef.current) {
          selectedElRef.current.style.outline = selectedElRef.current.getAttribute('data-outline') || 'none';
          selectedElRef.current = null;
        }
        return;
      }
      // Find the editable box ancestor
      let el: HTMLElement | null = target;
      while (el && el !== overlay && el.contentEditable !== 'true') {
        el = el.parentElement;
      }
      if (el && el.contentEditable === 'true') {
        e.preventDefault();
        // mark selection
        if (selectedElRef.current && selectedElRef.current !== el) {
          selectedElRef.current.style.outline = selectedElRef.current.getAttribute('data-outline') || 'none';
        }
        selectedElRef.current = el;
        // store original outline so we can restore later
        const prevOutline = el.style.outline || 'none';
        el.setAttribute('data-outline', prevOutline);
        el.style.outline = '1px dashed #2563eb';
        // start dragging
        const { x, y } = getRelativePosFromEl(overlay, e);
        const left = parseFloat(el.style.left || '0');
        const top = parseFloat(el.style.top || '0');
        dragOffsetRef.current = { x: x - left, y: y - top };
        isDraggingRef.current = true;
      }
      return;
    }

    // Create new text/annotation box
    if (selectedTool !== 'text' && selectedTool !== 'annotation') return;
    e.preventDefault();
    const { x, y } = getRelativePosFromEl(overlay, e);
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.style.position = 'absolute';
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    div.style.minWidth = '40px';
    div.style.minHeight = '20px';
    div.style.padding = '2px 4px';
    if (selectedTool === 'annotation') {
      div.style.outline = '1px solid #f59e0b';
      div.style.background = 'rgba(255, 213, 128, 0.35)';
      div.style.color = '#111827';
      if (!div.textContent || div.textContent.trim() === '') {
        div.textContent = 'Note...';
      }
    } else {
      div.style.outline = '1px dashed #9ca3af';
      div.style.background = 'transparent';
      div.style.color = selectedColor;
    }
    div.style.whiteSpace = 'pre-wrap';
    div.style.font = '16px sans-serif';
    (div.style as any).pointerEvents = 'auto';
    overlay.appendChild(div);
    setTimeout(() => {
      div.focus();
      div.addEventListener('blur', () => {
        div.style.outline = 'none';
      }, { once: true });
    }, 0);
  };

  const handleOverlayMouseMove = (e: any) => {
    if (!isDraggingRef.current || selectedTool !== 'select') return;
    const overlay = textOverlayRef.current;
    const el = selectedElRef.current;
    if (!overlay || !el) return;
    const { x, y } = getRelativePosFromEl(overlay, e);
    const off = dragOffsetRef.current;
    el.style.left = `${x - off.x}px`;
    el.style.top = `${y - off.y}px`;
  };

  const handleOverlayMouseUp = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
    }
  };

  const handleCanvasMouseMove = (e: any) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getRelativePos(e);

    if (selectedTool === 'pen') {
      const last = lastPointRef.current || { x, y };
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      lastPointRef.current = { x, y };
      return;
    }

    if ((selectedTool === 'rectangle' || selectedTool === 'circle' || selectedTool === 'highlight') && shapeStartRef.current && baseImageDataRef.current) {
      // restore base image for preview
      ctx.putImageData(baseImageDataRef.current, 0, 0);
      const start = shapeStartRef.current;
      const w = x - start.x;
      const h = y - start.y;

      if (selectedTool === 'rectangle') {
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(start.x, start.y, w, h);
      } else if (selectedTool === 'circle') {
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(start.x + w / 2, start.y + h / 2, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (selectedTool === 'highlight') {
        ctx.fillStyle = 'rgba(255, 255, 0, 0.35)';
        ctx.fillRect(start.x, start.y, w, h);
      }
      return;
    }
  };

  const handleCanvasMouseUp = () => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (selectedTool === 'pen') {
      ctx.closePath();
    }
    setIsDrawing(false);
    lastPointRef.current = null;
    shapeStartRef.current = null;
    baseImageDataRef.current = null;
  };

  // End drawing if mouse is released outside canvas
  useEffect(() => {
    const onUp = () => handleCanvasMouseUp();
    if (typeof window !== 'undefined') {
      window.addEventListener('mouseup', onUp);
      return () => window.removeEventListener('mouseup', onUp);
    }
    return;
  }, [isDrawing]);

  // Expose methods to export and clear overlays
  useImperativeHandle(ref, () => ({
    getCurrentOverlayImage: async () => {
      const drawCanvas = canvasRef.current;
      const textLayer = textOverlayRef.current;
      const wrapper = pageWrapperRef.current;
      if (!drawCanvas || !wrapper) return null;

      const rect = wrapper.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));

      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const ctx = out.getContext('2d');
      if (!ctx) return null;

      // Draw freehand layer
      ctx.drawImage(drawCanvas, 0, 0, w, h);

      // Draw text elements
      if (textLayer) {
        const children = Array.from(textLayer.children) as HTMLElement[];
        for (const el of children) {
          const style = window.getComputedStyle(el);
          const color = style.color || '#000';
          const fontSize = parseInt(style.fontSize || '16', 10) || 16;
          const fontFamily = style.fontFamily || 'sans-serif';
          ctx.fillStyle = color;
          ctx.font = `${fontSize}px ${fontFamily}`;
          const x = parseFloat(el.style.left || '0');
          const y = parseFloat(el.style.top || '0');
          const text = el.textContent || '';
          // support multi-line
          const lines = text.split(/\n/);
          let yCursor = y + fontSize; // baseline
          for (const line of lines) {
            ctx.fillText(line, x, yCursor);
            yCursor += fontSize * 1.2;
          }
        }
      }

      const dataUrl = out.toDataURL('image/png');
      return { dataUrl, width: w, height: h };
    },
    clearOverlays: () => {
      const drawCanvas = canvasRef.current;
      const textLayer = textOverlayRef.current;
      if (drawCanvas) {
        const ctx = drawCanvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      }
      if (textLayer) {
        while (textLayer.firstChild) textLayer.removeChild(textLayer.firstChild);
      }
    },
    getOverlayState: async () => {
      const canvas = canvasRef.current;
      const textLayer = textOverlayRef.current;
      let draw: { dataUrl: string; width: number; height: number } | null = null;
      if (canvas) {
        draw = { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
      }
      const textHTML = textLayer?.innerHTML || '';
      return { composite: null, draw, textHTML };
    },
    setOverlayState: (state) => {
      applyOverlayState(state || null);
    }
  }), []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600">Loading PDF...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-gray-100">
      {/* Viewer Controls */}
      <div className={`${theme === 'modern'
        ? 'bg-slate-900/60 border-slate-700 text-slate-100 backdrop-blur supports-[backdrop-filter]:bg-slate-900/40'
        : 'bg-white border-gray-200'} border-b px-4 py-2 flex items-center justify-between`}>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className={theme === 'modern' ? 'border-slate-600 bg-white text-slate-900 hover:bg-slate-100' : ''}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          <span className={`text-sm ${theme === 'modern' ? 'text-slate-300' : 'text-gray-600'} min-w-[100px] text-center`}>
            {currentPage} / {numPages}
          </span>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage >= numPages}
            className={theme === 'modern' ? 'border-slate-600 bg-white text-slate-900 hover:bg-slate-100' : ''}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRotate}
            className={theme === 'modern' ? 'border-slate-600 bg-white text-slate-900 hover:bg-slate-100' : ''}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          
          <span className={`text-sm ${theme === 'modern' ? 'text-slate-300' : 'text-gray-600'}`}>
            {Math.round(scale * 100)}%
          </span>
        </div>
      </div>

      {/* PDF Display */}
      <div 
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto flex items-start justify-center p-4"
      >
        <Card className="shadow-lg">
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            className="flex items-center justify-center"
          >
            {pageLoading ? (
              <div className="p-8">
                <Skeleton className="w-[600px] h-[800px]" />
              </div>
            ) : (
              <div ref={pageWrapperRef} className="relative inline-block">
                <Page
                  pageNumber={currentPage}
                  scale={scale}
                  rotate={rotation}
                  onLoadSuccess={onPageLoadSuccess}
                  onLoadError={onPageLoadError}
                  className="border border-gray-200"
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
                {/* Drawing canvas overlay */}
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 z-10"
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={() => setIsDrawing(false)}
                  style={{
                    pointerEvents: ['pen','rectangle','circle','highlight'].includes(selectedTool) ? 'auto' : 'none',
                    cursor: ['pen','rectangle','circle','highlight'].includes(selectedTool) ? 'crosshair' : 'default'
                  }}
                />
                {/* Text overlay container */}
                <div
                  ref={textOverlayRef}
                  className="absolute inset-0 z-20"
                  style={{ pointerEvents: (selectedTool === 'text' || selectedTool === 'annotation' || selectedTool === 'select') ? 'auto' : 'none', cursor: selectedTool === 'select' ? 'move' : ((selectedTool === 'text' || selectedTool === 'annotation') ? 'text' : 'default') }}
                  onMouseDown={handleTextOverlayMouseDown}
                  onMouseMove={handleOverlayMouseMove}
                  onMouseUp={handleOverlayMouseUp}
                />
              </div>
            )}
          </Document>
        </Card>
      </div>
    </div>
  );
});

export default PDFViewer;