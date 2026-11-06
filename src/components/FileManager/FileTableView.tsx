import React from 'react';
import { ArrowDown, ArrowUp, FileText, Folder, Loader2 } from 'lucide-react';
import { FileItem, FileManagerConfig } from '@/types/filemanager';
import { chmodToCode } from '@/lib/chmod';
import { cn, formatDate, humanReadableFileSize, strLimit } from '@/lib/utils';

export type SortField = 'name' | 'size' | 'date' | 'permissions';

interface FileTableViewProps {
  config: FileManagerConfig;
  items: FileItem[];
  requesting: boolean;
  error: string;
  sortField: SortField;
  reverse: boolean;
  onSort: (field: SortField) => void;
  isSelected: (item: FileItem) => boolean;
  onSelect: (item: FileItem | null, e: React.MouseEvent, isRightClick?: boolean) => void;
  onSmartClick: (item: FileItem) => void;
  onContextMenuOpen: (e: React.MouseEvent, item: FileItem | null) => void;
  t: (key: string) => string;
}

export const FileTableView: React.FC<FileTableViewProps> = ({
  config,
  items,
  requesting,
  error,
  sortField,
  reverse,
  onSort,
  isSelected,
  onSelect,
  onSmartClick,
  onContextMenuOpen,
  t,
}) => {
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return reverse ? (
      <ArrowDown className="inline h-3.5 w-3.5 ml-1 text-primary" />
    ) : (
      <ArrowUp className="inline h-3.5 w-3.5 ml-1 text-primary" />
    );
  };

  return (
    <div
      className="w-full overflow-x-auto select-none min-h-[380px]"
      onContextMenu={(e) => {
        if (e.target === e.currentTarget) {
          onContextMenuOpen(e, null);
        }
      }}
    >
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="py-3 px-4">
              <button
                type="button"
                onClick={() => onSort('name')}
                className="flex items-center hover:text-foreground"
              >
                {t('name')}
                {renderSortIcon('name')}
              </button>
            </th>
            {!config.hideSize && (
              <th className="hidden sm:table-cell py-3 px-4 w-32">
                <button
                  type="button"
                  onClick={() => onSort('size')}
                  className="flex items-center hover:text-foreground"
                >
                  {t('size')}
                  {renderSortIcon('size')}
                </button>
              </th>
            )}
            {!config.hideDate && (
              <th className="hidden md:table-cell py-3 px-4 w-48">
                <button
                  type="button"
                  onClick={() => onSort('date')}
                  className="flex items-center hover:text-foreground"
                >
                  {t('date')}
                  {renderSortIcon('date')}
                </button>
              </th>
            )}
            {!config.hidePermissions && (
              <th className="hidden md:table-cell py-3 px-4 w-36">
                <button
                  type="button"
                  onClick={() => onSort('permissions')}
                  className="flex items-center hover:text-foreground"
                >
                  {t('permissions')}
                  {renderSortIcon('permissions')}
                </button>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y">
          {requesting && (
            <tr>
              <td colSpan={4} className="py-16 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              </td>
            </tr>
          )}

          {!requesting && !error && items.length === 0 && (
            <tr
              onContextMenu={(e) => {
                e.preventDefault();
                onContextMenuOpen(e, null);
              }}
            >
              <td colSpan={4} className="py-12 px-4 text-center text-muted-foreground">
                {t('no_files_in_folder')}...
              </td>
            </tr>
          )}

          {!requesting && error && (
            <tr>
              <td colSpan={4} className="py-8 px-4">
                <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-destructive text-sm">
                  {error}
                </div>
              </td>
            </tr>
          )}

          {!requesting &&
            !error &&
            items.map((item) => {
              const selected = isSelected(item);
              const isDir = item.model.type === 'dir';
              return (
                <tr
                  key={item.id}
                  onClick={(e) => onSelect(item, e, false)}
                  onDoubleClick={() => onSmartClick(item)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(item, e, true);
                    onContextMenuOpen(e, item);
                  }}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-accent/60',
                    selected && 'bg-primary/15 hover:bg-primary/20 font-medium'
                  )}
                >
                  <td className="py-2.5 px-4">
                    <div
                      className="flex items-center gap-2.5"
                      title={`${item.model.name} (${humanReadableFileSize(
                        item.model.size,
                        config.useBinarySizePrefixes
                      )})`}
                    >
                      {isDir ? (
                        <Folder className="h-4 w-4 shrink-0 text-amber-500 fill-amber-500/20" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-sky-600" />
                      )}
                      <span className="truncate">{strLimit(item.model.name, 64)}</span>
                    </div>
                  </td>

                  {!config.hideSize && (
                    <td className="hidden sm:table-cell py-2.5 px-4 text-muted-foreground text-xs">
                      {(!isDir || config.showSizeForDirectories) &&
                        humanReadableFileSize(item.model.size, config.useBinarySizePrefixes)}
                    </td>
                  )}

                  {!config.hideDate && (
                    <td className="hidden md:table-cell py-2.5 px-4 text-muted-foreground text-xs font-mono">
                      {formatDate(item.model.date)}
                    </td>
                  )}

                  {!config.hidePermissions && (
                    <td className="hidden md:table-cell py-2.5 px-4 text-muted-foreground text-xs font-mono">
                      {chmodToCode(item.model.perms, isDir ? 'd' : '-')}
                    </td>
                  )}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
};

