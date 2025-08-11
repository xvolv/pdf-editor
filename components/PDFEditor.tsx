'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, Download, Plus, Minus, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import PDFViewer from './PDFViewer';
import Toolbar from './Toolbar';
import PageManager from './PageManager';
import FileUploader from './FileUploader';
import { PDFDocument } from 'pdf-lib';

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
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(async (file: File) => {
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pageCount = pdfDoc.getPageCount();

      setState(prev => ({
        ...prev,
        pdfFile: file,
        pdfDocument: pdfDoc,
        currentPage: 1,
        totalPages: pageCount,
        annotations: [],
        isLoading: false,
      }));

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
  }, [state.pdfDocument, state.pdfFile, toast]);

  const handlePageNavigation = useCallback((page: number) => {
    if (page >= 1 && page <= state.totalPages) {
      setState(prev => ({ ...prev, currentPage: page }));
    }
  }, [state.totalPages]);

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
    <div className="h-screen flex flex-col bg-gray-50">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
        className="hidden"
      />
      
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-semibold text-gray-900">PDF Editor</h1>
          <div className="hidden sm:flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewFile}
              className="flex items-center space-x-2"
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
                className="flex items-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </Button>
            )}
          </div>
        </div>

        {state.pdfFile && (
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              Page {state.currentPage} of {state.totalPages}
            </span>
            <div className="flex items-center space-x-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddPage}
                disabled={state.isLoading}
                title="Add Page"
              >
                <Plus className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemovePage}
                disabled={state.isLoading || state.totalPages <= 1}
                title="Remove Page"
              >
                <Minus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {state.pdfFile && sidebarOpen && (
          <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
            <Toolbar
              selectedTool={selectedTool}
              onToolSelect={setSelectedTool}
              scale={state.scale}
              onScaleChange={handleScaleChange}
              selectedColor={selectedColor}
              onColorSelect={setSelectedColor}
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

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!state.pdfFile ? (
            <div className="flex-1 flex items-center justify-center">
              <FileUploader onFileSelect={handleFileUpload} />
            </div>
          ) : (
            <PDFViewer
              file={state.pdfFile}
              currentPage={state.currentPage}
              scale={state.scale}
              selectedTool={selectedTool}
              onPageChange={handlePageNavigation}
              annotations={state.annotations}
              isLoading={state.isLoading}
              selectedColor={selectedColor}
            />
          )}
        </div>
      </div>
    </div>
  );
}