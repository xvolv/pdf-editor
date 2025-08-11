'use client';
import { 
  MousePointer, 
  Type, 
  Highlighter, 
  MessageSquare, 
  Square,
  Circle,
  Pen,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';

interface ToolbarProps {
  selectedTool: string;
  onToolSelect: (tool: string) => void;
  scale: number;
  onScaleChange: (scale: number) => void;
  selectedColor?: string;
  onColorSelect?: (color: string) => void;
  theme?: 'classic' | 'modern';
}

const tools = [
  { id: 'select', icon: MousePointer, label: 'Select' },
  { id: 'text', icon: Type, label: 'Add Text' },
  { id: 'highlight', icon: Highlighter, label: 'Highlight' },
  { id: 'annotation', icon: MessageSquare, label: 'Add Note' },
  { id: 'rectangle', icon: Square, label: 'Rectangle' },
  { id: 'circle', icon: Circle, label: 'Circle' },
  { id: 'pen', icon: Pen, label: 'Draw' },
];

export default function Toolbar({ 
  selectedTool, 
  onToolSelect, 
  scale, 
  onScaleChange,
  selectedColor = '#000000',
  onColorSelect,
  theme = 'classic',
}: ToolbarProps) {
  const handleZoomIn = () => {
    onScaleChange(Math.min(scale + 0.25, 3.0));
  };

  const handleZoomOut = () => {
    onScaleChange(Math.max(scale - 0.25, 0.5));
  };

  const handleScaleChange = (value: number[]) => {
    onScaleChange(value[0]);
  };

  return (
    <TooltipProvider>
      <div className="p-4 space-y-6">
        {/* Drawing Tools */}
        <div className="space-y-3">
          <h3 className={`text-sm font-medium ${theme === 'modern' ? 'text-slate-200' : 'text-gray-700'}`}>Tools</h3>
          <div className="grid grid-cols-2 gap-2">
            {tools.map((tool) => (
              <Tooltip key={tool.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant={selectedTool === tool.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onToolSelect(tool.id)}
                    className={`w-full justify-start ${theme === 'modern' 
                      ? (selectedTool === tool.id 
                        ? '' 
                        : 'border-slate-600 bg-white text-slate-900 hover:bg-slate-100') 
                      : ''}`}
                  >
                    <tool.icon className="w-4 h-4 mr-2" />
                    <span className="text-xs">{tool.label}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{tool.label}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        <Separator />

        {/* Zoom Controls */}
        <div className="space-y-3">
          <h3 className={`text-sm font-medium ${theme === 'modern' ? 'text-slate-200' : 'text-gray-700'}`}>Zoom</h3>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              className={theme === 'modern' ? 'border-slate-600 bg-white text-slate-900 hover:bg-slate-100' : ''}
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            
            <div className="flex-1 px-2">
              <Slider
                value={[scale]}
                onValueChange={handleScaleChange}
                min={0.5}
                max={3.0}
                step={0.25}
                className="w-full"
              />
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomIn}
              disabled={scale >= 3.0}
              className={theme === 'modern' ? 'border-slate-600 bg-white text-slate-900 hover:bg-slate-100' : ''}
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="text-center">
            <span className={`text-sm ${theme === 'modern' ? 'text-slate-300' : 'text-gray-600'}`}>
              {Math.round(scale * 100)}%
            </span>
          </div>
        </div>

        <Separator />

        {/* Color Palette  */}
        <div className="space-y-3">
          <h3 className={`text-sm font-medium ${theme === 'modern' ? 'text-slate-200' : 'text-gray-700'}`}>Colors</h3>
          <div className="grid grid-cols-4 gap-2">
            {[
              '#000000', '#FF0000', '#00FF00', '#0000FF',
              '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500'
            ].map((color) => (
              <button
                key={color}
                className={`w-8 h-8 rounded border-2 transition-colors ${selectedColor === color 
                  ? (theme === 'modern' ? 'border-blue-400' : 'border-blue-600') 
                  : (theme === 'modern' ? 'border-slate-600 hover:border-slate-500' : 'border-gray-300 hover:border-gray-400')}`}
                style={{ backgroundColor: color }}
                onClick={() => onColorSelect && onColorSelect(color)}
                aria-label={`Select color ${color}`}
              />
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}