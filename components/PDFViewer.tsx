'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
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

interface PDFViewerProps {
  file: File;
  currentPage: number;
  scale: number;
  selectedTool: string;
  onPageChange: (page: number) => void;
  annotations: any[];
  isLoading?: boolean;
  selectedColor?: string;
}

export default function PDFViewer({
  file,
  currentPage,
  scale,
  selectedTool,
  onPageChange,
  annotations,
  isLoading = false,
  selectedColor = '#000000',
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageLoading, setPageLoading] = useState<boolean>(true);
  const [rotation, setRotation] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageWrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textOverlayRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const lastPointRef = useRef<{x:number;y:number}|null>(null);

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

  const onPageLoadSuccess = useCallback(() => {
    setPageLoading(false);
    // Ensure overlay sizes match rendered page size
    requestAnimationFrame(() => {
      const wrapper = pageWrapperRef.current;
      const canvas = canvasRef.current;
      if (!wrapper || !canvas) return;
      const rect = wrapper.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width));
      canvas.height = Math.max(1, Math.floor(rect.height));
      canvas.style.width = `${Math.floor(rect.width)}px`;
      canvas.style.height = `${Math.floor(rect.height)}px`;
    });
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
    }
  }, [handlePrevPage, handleNextPage]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Keep overlay sizes in sync when view changes
  useEffect(() => {
    const wrapper = pageWrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    const rect = wrapper.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width));
    canvas.height = Math.max(1, Math.floor(rect.height));
  }, [scale, rotation, currentPage]);

  useEffect(() => {
    const onResize = () => {
      const wrapper = pageWrapperRef.current;
      const canvas = canvasRef.current;
      if (!wrapper || !canvas) return;
      const rect = wrapper.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width));
      canvas.height = Math.max(1, Math.floor(rect.height));
      // keep CSS size in sync to avoid scaling blur
      canvas.style.width = `${Math.floor(rect.width)}px`;
      canvas.style.height = `${Math.floor(rect.height)}px`;
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
    if (selectedTool === 'pen') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { x, y } = getRelativePos(e);
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
    }
  };

  const handleTextOverlayMouseDown = (e: any) => {
    if (selectedTool !== 'text') return;
    e.preventDefault();
    const overlay = textOverlayRef.current;
    if (!overlay) return;
    const { x, y } = getRelativePosFromEl(overlay, e);
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.style.position = 'absolute';
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    div.style.minWidth = '40px';
    div.style.minHeight = '20px';
    div.style.padding = '2px 4px';
    div.style.outline = '1px dashed #9ca3af';
    div.style.color = selectedColor;
    div.style.background = 'transparent';
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

  const handleCanvasMouseMove = (e: any) => {
    if (!isDrawing || selectedTool !== 'pen') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getRelativePos(e);
    const last = lastPointRef.current || { x, y };
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastPointRef.current = { x, y };
  };

  const handleCanvasMouseUp = () => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.closePath();
    setIsDrawing(false);
    lastPointRef.current = null;
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
    <div className="flex-1 flex flex-col bg-gray-100">
      {/* Viewer Controls */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          <span className="text-sm text-gray-600 min-w-[100px] text-center">
            {currentPage} / {numPages}
          </span>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage >= numPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRotate}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          
          <span className="text-sm text-gray-600">
            {Math.round(scale * 100)}%
          </span>
        </div>
      </div>

      {/* PDF Display */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto flex items-center justify-center p-4"
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
                  style={{ pointerEvents: selectedTool === 'pen' ? 'auto' : 'none', cursor: selectedTool === 'pen' ? 'crosshair' : 'default' }}
                />
                {/* Text overlay container */}
                <div
                  ref={textOverlayRef}
                  className="absolute inset-0 z-20"
                  style={{ pointerEvents: selectedTool === 'text' ? 'auto' : 'none', cursor: selectedTool === 'text' ? 'text' : 'default' }}
                  onMouseDown={handleTextOverlayMouseDown}
                />
              </div>
            )}
          </Document>
        </Card>
      </div>
    </div>
  );
}