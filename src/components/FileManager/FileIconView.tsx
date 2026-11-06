import React from 'react';
import { FileText, FolderOpen, Loader2 } from 'lucide-react';
import { FileItem, FileManagerConfig } from '@/types/filemanager';
import { cn, fileExtension, humanReadableFileSize, strLimit } from '@/lib/utils';

interface FileIconViewProps {
  config: FileManagerConfig;
  items: FileItem[];
  requesting: boolean;
  error: string;
  isSelected: (item: FileItem) => boolean;
  onSelect: (item: FileItem | null, e: React.MouseEvent, isRightClick?: boolean) => void;
  onSmartClick: (item: FileItem) => void;
  onContextMenuOpen: (e: React.MouseEvent, item: FileItem | null) => void;
  t: (key: string) => string;
}

export const FileIconView: React.FC<FileIconViewProps> = ({
  config,
  items,
  requesting,
  error,
  isSelected,
  onSelect,
  onSmartClick,
  onContextMenuOpen,
  t,
}) => {
  if (requesting) {
    return (
      <div className="flex py-20 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-destructive text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="p-6 min-h-[360px]"
        onClick={(e) => onSelect(null, e, false)}
        onContextMenu={(e) => {
          e.preventDefault();
          onSelect(null, e, true);
          onContextMenuOpen(e, null);
        }}
      >
        <div className="rounded-md bg-amber-50 border border-amber-200 p-4 text-amber-800 text-sm">
          {t('no_files_in_folder')}...
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-4 select-none min-h-[380px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onSelect(null, e, false);
        }
      }}
      onContextMenu={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          onSelect(null, e, true);
          onContextMenuOpen(e, null);
        }
      }}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {items.map((item) => {
          const selected = isSelected(item);
          const isDir = item.model.type === 'dir';
          const ext = !isDir && config.showExtensionIcons ? fileExtension(item.model.name) : '';

          return (
            <div
              key={item.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(item, e, false);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onSmartClick(item);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(item, e, true);
                onContextMenuOpen(e, item);
              }}
              title={`${item.model.name} (${humanReadableFileSize(
                item.model.size,
                config.useBinarySizePrefixes
              )})`}
              className={cn(
                'group flex flex-col items-center justify-center rounded-lg border p-3 text-center cursor-pointer transition-all hover:shadow-sm hover:border-primary/40',
                selected
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-card hover:bg-accent/40'
              )}
            >
              <div className="relative mb-2 flex h-12 w-12 items-center justify-center">
                {isDir ? (
                  <FolderOpen
                    className={cn(
                      'h-11 w-11',
                      selected ? 'text-primary-foreground' : 'text-amber-500 fill-amber-500/15'
                    )}
                  />
                ) : (
                  <>
                    <FileText
                      className={cn(
                        'h-11 w-11',
                        selected ? 'text-primary-foreground' : 'text-sky-600'
                      )}
                    />
                    {ext && (
                      <span
                        className={cn(
                          'absolute bottom-1 rounded px-1 py-0.2 text-[9px] font-bold uppercase tracking-tighter',
                          selected
                            ? 'bg-primary-foreground text-primary'
                            : 'bg-sky-600 text-white'
                        )}
                      >
                        {ext}
                      </span>
                    )}
                  </>
                )}
              </div>
              <span className="w-full truncate text-xs font-medium">
                {strLimit(item.model.name, 14)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

