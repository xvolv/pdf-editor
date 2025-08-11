  'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, Download, Plus, Minus, RotateCcw, Save, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import PDFViewer, { type PDFViewerHandle } from './PDFViewer';
import Toolbar from './Toolbar';
import PageManager from './PageManager';
import FileUploader from './FileUploader';
import { PDFDocument } from 'pdf-lib';

// Free tier limits (constants allowed after 'use client')
const FREE_MAX_PAGES = 10;
const FREE_MAX_BYTES = 10 * 1024 * 1024; // 10MB

interface PDFEditorState {
  pdfFile: File | null;
  pdfDocument: PDFDocument | null;
  currentPage: number;
  totalPages: number;
  scale: number;
  annotations: any[];
  isLoading: boolean;
}

export default function PDFEditor() {
  const [state, setState] = useState<PDFEditorState>({
    pdfFile: null,
    pdfDocument: null,
    currentPage: 1,
    totalPages: 0,
    scale: 1.0,
    annotations: [],
    isLoading: false,
  });

  const [selectedTool, setSelectedTool] = useState<string>('select');
  const [selectedColor, setSelectedColor] = useState<string>('#000000');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<'classic' | 'modern'>('classic');
  const [upgradeRequired, setUpgradeRequired] = useState<null | { reason: 'size' | 'pages'; pageCount?: number; fileSize?: number }>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<PDFViewerHandle | null>(null);
  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState<number>(256); // px
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(256);

  // Per-page overlays storage
  type OverlayBitmap = { dataUrl: string; width: number; height: number };
  type PageOverlayState = {
    composite?: OverlayBitmap | null;
    draw?: OverlayBitmap | null;
    textHTML?: string;
  };
  const [overlaysByPage, setOverlaysByPage] = useState<Record<number, PageOverlayState>>({});

  const handleFileUpload = useCallback(async (file: File) => {
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      // Check free tier file size first
      if (file.size > FREE_MAX_BYTES) {
        setUpgradeRequired({ reason: 'size', fileSize: file.size });
        setState(prev => ({ ...prev, isLoading: false }));
        toast({
          title: 'Upgrade Required',
          description: 'This file exceeds the 10MB limit for the free tier. Please upgrade to continue.',
          variant: 'destructive',
        });
        return;
      }

      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pageCount = pdfDoc.getPageCount();

      if (pageCount > FREE_MAX_PAGES) {
        setUpgradeRequired({ reason: 'pages', pageCount });
        setState(prev => ({ ...prev, isLoading: false }));
        toast({
          title: 'Upgrade Required',
          description: `This PDF has ${pageCount} pages, which exceeds the free tier limit of ${FREE_MAX_PAGES}.`,
          variant: 'destructive',
        });
        return;
      }

      setState(prev => ({
        ...prev,
        pdfFile: file,
        pdfDocument: pdfDoc,
        currentPage: 1,
        totalPages: pageCount,
        annotations: [],
        isLoading: false,
      }));

      // Reset overlays map for new document
      setOverlaysByPage({});

      // Clear any previous upgrade state on successful load
      setUpgradeRequired(null);

      toast({
        title: "PDF Loaded Successfully",
        description: `Loaded PDF with ${pageCount} pages`,
      });
    } catch (error) {
      console.error('Error loading PDF:', error);
      toast({
        title: "Error Loading PDF",
        description: "Please try uploading a valid PDF file",
        variant: "destructive",
      });
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [toast]);

  // Sidebar resize handlers
  const onResizerMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const dx = e.clientX - startXRef.current;
    const next = Math.min(Math.max(startWidthRef.current + dx, 200), 480); // clamp 200-480px
    setSidebarWidth(next);
  }, [isResizing]);

  const stopResizing = useCallback(() => {
    if (!isResizing) return;
    setIsResizing(false);
    document.removeEventListener('mousemove', onResizerMouseMove as any);
    document.removeEventListener('mouseup', stopResizing as any);
  }, [isResizing, onResizerMouseMove]);

  const startResizing = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
    document.addEventListener('mousemove', onResizerMouseMove as any);
    document.addEventListener('mouseup', stopResizing as any);
  }, [sidebarWidth, onResizerMouseMove, stopResizing]);

  const saveCurrentPageOverlay = useCallback(async () => {
    if (!viewerRef.current) return;
    try {
      const [composite, snapshot] = await Promise.all([
        viewerRef.current.getCurrentOverlayImage?.(),
        viewerRef.current.getOverlayState?.(),
      ]);
      setOverlaysByPage(prev => ({
        ...prev,
        [state.currentPage]: {
          composite: composite || null,
          draw: snapshot?.draw || null,
          textHTML: snapshot?.textHTML || '',
        },
      }));
    } catch {}
  }, [state.currentPage]);

  const handleDownload = useCallback(async () => {
    if (!state.pdfDocument) {
      toast({
        title: "No PDF to Download",
        description: "Please upload a PDF file first",
        variant: "destructive",
      });
      return;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true }));
      // Ensure current page overlays are saved
      await saveCurrentPageOverlay();

      // Flatten overlays for ALL pages
      for (let i = 1; i <= state.totalPages; i++) {
        const pageIndex = i - 1;
        const page = state.pdfDocument.getPage(pageIndex);
        const { width: pw, height: ph } = page.getSize();
        const pageOverlay = overlaysByPage[i];
        const composite = pageOverlay?.composite;
        if (composite && composite.dataUrl) {
          const pngBytes = await fetch(composite.dataUrl).then(r => r.arrayBuffer());
          const pngEmbed = await state.pdfDocument.embedPng(pngBytes);
          page.drawImage(pngEmbed, {
            x: 0,
            y: 0,
            width: pw,
            height: ph,
            opacity: 1,
          });
        }
      }
      
      const pdfBytes = await state.pdfDocument.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited-${state.pdfFile?.name || 'document.pdf'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Keep editing: update both the viewer File and the in-memory PDFDocument
      const newFileName = `edited-${state.pdfFile?.name || 'document.pdf'}`;
      const newFile = new File([pdfBytes], newFileName, { type: 'application/pdf' });
      const reloadedDoc = await PDFDocument.load(pdfBytes);
      const newPageCount = reloadedDoc.getPageCount();
      setState(prev => ({
        ...prev,
        pdfFile: newFile,
        pdfDocument: reloadedDoc,
        totalPages: newPageCount,
        // keep current page if still valid, otherwise clamp
        currentPage: Math.min(prev.currentPage, newPageCount),
      }));
      // Clear overlay layers now that content is flattened
      viewerRef.current?.clearOverlays?.();
      // Clear overlays store, since content is baked-in
      setOverlaysByPage({});

      toast({
        title: "PDF Downloaded",
        description: "Your edited PDF has been downloaded successfully",
      });
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({
        title: "Download Error",
        description: "Failed to download the PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [
    state.pdfDocument,
    state.pdfFile,
    state.totalPages,
    state.currentPage,
    overlaysByPage,
    toast
  ]);

  const handlePageNavigation = useCallback(async (page: number) => {
    if (page < 1 || page > state.totalPages) return;
    // Save current page overlays before switching
    await saveCurrentPageOverlay();
    setState(prev => ({ ...prev, currentPage: page }));
  }, [saveCurrentPageOverlay, state.totalPages]);

  const handleScaleChange = useCallback((newScale: number) => {
    setState(prev => ({ ...prev, scale: Math.max(0.5, Math.min(3.0, newScale)) }));
  }, []);

  const handleNewFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleAddPage = useCallback(async () => {
    if (!state.pdfDocument) return;

    try {
      state.pdfDocument.addPage();
      const newPageCount = state.pdfDocument.getPageCount();
      
      setState(prev => ({
        ...prev,
        totalPages: newPageCount,
        currentPage: newPageCount,
      }));

      // Initialize overlay entry for the new page (empty)
      setOverlaysByPage(prev => ({ ...prev, [newPageCount]: {} }));

      toast({
        title: "Page Added",
        description: `New page added at position ${newPageCount}`,
      });
    } catch (error) {
      console.error('Error adding page:', error);
      toast({
        title: "Error Adding Page",
        description: "Failed to add new page",
        variant: "destructive",
      });
    }
  }, [state.pdfDocument, toast]);

  const handleRemovePage = useCallback(async () => {
    if (!state.pdfDocument || state.totalPages <= 1) {
      toast({
        title: "Cannot Remove Page",
        description: "PDF must have at least one page",
        variant: "destructive",
      });
      return;
    }

    try {
      state.pdfDocument.removePage(state.currentPage - 1);
      const newPageCount = state.pdfDocument.getPageCount();
      const newCurrentPage = Math.min(state.currentPage, newPageCount);
      
      setState(prev => ({
        ...prev,
        totalPages: newPageCount,
        currentPage: newCurrentPage,
      }));

      // Reindex overlays map for pages after the removed one
      setOverlaysByPage(prev => {
        const removed = state.currentPage; // 1-based index
        const next: Record<number, PageOverlayState> = {};
        for (let i = 1; i <= newPageCount; i++) {
          // For i before removed, copy as-is; for i >= removed, shift from i+1
          if (i < removed) {
            if (prev[i]) next[i] = prev[i];
          } else {
            if (prev[i + 1]) next[i] = prev[i + 1];
          }
        }
        return next;
      });

      toast({
        title: "Page Removed",
        description: `Page ${state.currentPage} has been removed`,
      });
    } catch (error) {
      console.error('Error removing page:', error);
      toast({
        title: "Error Removing Page",
        description: "Failed to remove the page",
        variant: "destructive",
      });
    }
  }, [state.pdfDocument, state.currentPage, state.totalPages, toast]);

  return (
    <div className={
      `h-screen flex flex-col ${theme === 'modern' 
        ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100' 
        : 'bg-gray-50 text-gray-900'}`
    }>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
        className="hidden"
      />
      
      {/* Header */}
      <header className={`${theme === 'modern' 
        ? 'bg-slate-900/60 border-slate-700 text-slate-100 backdrop-blur supports-[backdrop-filter]:bg-slate-900/40' 
        : 'bg-white border-gray-200'} border-b px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center space-x-4">
          <h1 className={`text-xl font-semibold ${theme === 'modern' ? 'text-slate-100' : 'text-gray-900'}`}>PDF Editor</h1>
          <div className="hidden sm:flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewFile}
              className={`flex items-center space-x-2 ${theme === 'modern' ? 'border-slate-600 bg-white text-slate-900 hover:bg-slate-100' : ''}`}
            >
              <Upload className="w-4 h-4" />
              <span>Upload</span>
            </Button>
            {state.pdfFile && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={state.isLoading}
                className={`flex items-center space-x-2 ${theme === 'modern' ? 'border-slate-600 bg-white text-slate-900 hover:bg-slate-100' : ''}`}
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </Button>
            )}
          </div>
        </div>

        {state.pdfFile && (
          <div className="flex items-center space-x-4">
            <span className={`text-sm ${theme === 'modern' ? 'text-slate-300' : 'text-gray-600'}`}>
              Page {state.currentPage} of {state.totalPages}
            </span>
            <div className="flex items-center space-x-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddPage}
                disabled={state.isLoading}
                title="Add Page"
                className={theme === 'modern' ? 'border-slate-600 bg-white text-slate-900 hover:bg-slate-100' : ''}
              >
                <Plus className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemovePage}
                disabled={state.isLoading || state.totalPages <= 1}
                title="Remove Page"
                className={theme === 'modern' ? 'border-slate-600 bg-white text-slate-900 hover:bg-slate-100' : ''}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTheme(prev => {
                    const next = prev === 'classic' ? 'modern' : 'classic';
                    // Improve contrast: when switching to modern, default to white draw/text color if currently black
                    if (next === 'modern' && selectedColor === '#000000') {
                      setSelectedColor('#FFFFFF');
                    }
                    return next;
                  });
                }}
                title="Toggle Theme"
                className={theme === 'modern' ? 'border-slate-600 bg-white text-slate-900 hover:bg-slate-100' : ''}
              >
                <Sparkles className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </header>

      <div className={`flex-1 flex overflow-hidden min-h-0 ${isResizing ? 'select-none cursor-col-resize' : ''}`}>
        {/* Sidebar */}
        {state.pdfFile && sidebarOpen && (
          <div
            className={`${theme === 'modern' 
              ? 'bg-slate-900/40 border-slate-700' 
              : 'bg-white border-gray-200'} border-r flex flex-col overflow-y-auto min-h-0`}
            style={{ width: `${sidebarWidth}px` }}
          >
            <Toolbar
              selectedTool={selectedTool}
              onToolSelect={setSelectedTool}
              scale={state.scale}
              onScaleChange={handleScaleChange}
              selectedColor={selectedColor}
              onColorSelect={setSelectedColor}
              theme={theme}
            />
            
            <div className="flex-1 overflow-y-auto p-4">
              <PageManager
                currentPage={state.currentPage}
                totalPages={state.totalPages}
                onPageSelect={handlePageNavigation}
                pdfFile={state.pdfFile}
              />
            </div>
          </div>
        )}

        {state.pdfFile && sidebarOpen && (
          <div
            onMouseDown={startResizing}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            className={`w-1 cursor-col-resize hover:bg-slate-500/20 active:bg-slate-500/30 ${theme === 'modern' ? 'bg-slate-700/10' : 'bg-gray-200/50'}`}
          />
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-auto min-h-0">
          {!state.pdfFile ? (
            <div className="flex-1 flex items-center justify-center p-6">
              {upgradeRequired ? (
                <div className={`max-w-xl w-full rounded-lg border p-6 text-center ${theme === 'modern' ? 'bg-slate-900/50 border-slate-700 text-slate-100' : 'bg-white border-gray-200 text-gray-900'}`}>
                  <h2 className="text-lg font-semibold mb-2">Upgrade Required</h2>
                  <p className={`mb-4 ${theme === 'modern' ? 'text-slate-300' : 'text-gray-600'}`}>
                    {upgradeRequired.reason === 'size' && 'This file exceeds the 10MB limit for the free tier.'}
                    {upgradeRequired.reason === 'pages' && `This PDF exceeds the free tier limit of ${FREE_MAX_PAGES} pages${upgradeRequired.pageCount ? ` (has ${upgradeRequired.pageCount})` : ''}.`}
                    {' '}Please upgrade to continue.
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <a
                      href="/pricing"
                      className={`px-4 py-2 rounded-md font-medium ${theme === 'modern' ? 'bg-white text-slate-900 hover:bg-slate-100' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                    >
                      Upgrade Now
                    </a>
                    <button
                      onClick={() => {
                        setUpgradeRequired(null);
                        fileInputRef.current?.click();
                      }}
                      className={`px-4 py-2 rounded-md border font-medium ${theme === 'modern' ? 'border-slate-600 bg-transparent text-slate-100 hover:bg-slate-800/50' : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'}`}
                    >
                      Choose Another File
                    </button>
                  </div>
                </div>
              ) : (
                <FileUploader onFileSelect={handleFileUpload} />
              )}
            </div>
          ) : (
            <PDFViewer
              ref={viewerRef}
              file={state.pdfFile}
              currentPage={state.currentPage}
              scale={state.scale}
              selectedTool={selectedTool}
              onPageChange={handlePageNavigation}
              annotations={state.annotations}
              isLoading={state.isLoading}
              selectedColor={selectedColor}
              theme={theme}
              loadOverlayForPage={(p) => overlaysByPage[p] || null}
            />
          )}
        </div>
      </div>
    </div>
  );
}
