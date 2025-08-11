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
}

export default function PDFViewer({
  file,
  currentPage,
  scale,
  selectedTool,
  onPageChange,
  annotations,
  isLoading = false,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageLoading, setPageLoading] = useState<boolean>(true);
  const [rotation, setRotation] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

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
            )}
          </Document>
        </Card>
      </div>
    </div>
  );
}