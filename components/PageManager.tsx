'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const Document = dynamic(() => import('react-pdf').then(mod => ({ default: mod.Document })), { ssr: false });
const Page = dynamic(() => import('react-pdf').then(mod => ({ default: mod.Page })), { ssr: false });

interface PageManagerProps {
  currentPage: number;
  totalPages: number;
  onPageSelect: (page: number) => void;
  pdfFile: File;
}

export default function PageManager({
  currentPage,
  totalPages,
  onPageSelect,
  pdfFile,
}: PageManagerProps) {
  const [thumbnailsLoaded, setThumbnailsLoaded] = useState<boolean[]>([]);

  useEffect(() => {
    setThumbnailsLoaded(new Array(totalPages).fill(false));
  }, [totalPages]);

  const handleThumbnailLoad = (pageNum: number) => {
    setThumbnailsLoaded(prev => {
      const newState = [...prev];
      newState[pageNum - 1] = true;
      return newState;
    });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-700">Pages</h3>
      
      <div className="space-y-2 max-h-96 overflow-y-auto">
        <Document file={pdfFile}>
          {Array.from(new Array(totalPages), (el, index) => (
            <Card
              key={`page_${index + 1}`}
              className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                currentPage === index + 1
                  ? 'ring-2 ring-blue-500 shadow-md'
                  : 'hover:ring-1 hover:ring-gray-300'
              }`}
              onClick={() => onPageSelect(index + 1)}
            >
              <CardContent className="p-2">
                <div className="relative">
                  {!thumbnailsLoaded[index] && (
                    <Skeleton className="w-full h-24 rounded" />
                  )}
                  
                  <Page
                    pageNumber={index + 1}
                    scale={0.2}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    onLoadSuccess={() => handleThumbnailLoad(index + 1)}
                    className={`w-full ${thumbnailsLoaded[index] ? 'block' : 'hidden'}`}
                  />
                  
                  <div className="absolute bottom-1 left-1 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
                    {index + 1}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </Document>
      </div>

      <div className="text-xs text-gray-500 text-center">
        {totalPages} page{totalPages !== 1 ? 's' : ''}
      </div>
    </div>
  );
}