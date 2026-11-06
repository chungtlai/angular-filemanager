import React, { useEffect, useRef } from 'react';
import {
  Archive,
  ArrowRight,
  Copy,
  Download,
  Edit3,
  Eye,
  FileEdit,
  FolderOpen,
  FolderPlus,
  Hand,
  Lock,
  PackageOpen,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { FileItem, FileManagerConfig, ModalType } from '@/types/filemanager';
import { getFullPath, isEditable, isExtractable, isFolder, isImage, isSelectable } from '@/lib/item';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface FileContextMenuProps {
  position: ContextMenuPosition | null;
  onClose: () => void;
  config: FileManagerConfig;
  selectedItems: FileItem[];
  onSmartClick: (item: FileItem) => void;
  onDownload: () => void;
  onOpenImagePreview: () => void;
  onOpenEditItem: () => void;
  onOpenModal: (modal: ModalType, withPathSelector?: boolean) => void;
  onOpenNewFolder: () => void;
  t: (key: string) => string;
}

export const FileContextMenu: React.FC<FileContextMenuProps> = ({
  position,
  onClose,
  config,
  selectedItems,
  onSmartClick,
  onDownload,
  onOpenImagePreview,
  onOpenEditItem,
  onOpenModal,
  onOpenNewFolder,
  t,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;
    const handleClickOutside = () => onClose();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [position, onClose]);

  if (!position) return null;

  const singleItem = selectedItems.length === 1 ? selectedItems[0] : null;
  const hasDir = selectedItems.some((item) => item.model.type === 'dir');

  // Keep menu inside viewport
  const left = Math.min(position.x, window.innerWidth - 220);
  const top = Math.min(position.y, window.innerHeight - 320);

  const itemClass =
    'flex w-full items-center gap-2.5 rounded-sm px-3 py-1.5 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors text-left';

  return (
    <div
      ref={menuRef}
      style={{ left, top }}
      className="fixed z-50 min-w-[200px] rounded-md border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
      onClick={(e) => e.stopPropagation()}
    >
      {selectedItems.length > 0 ? (
        <div className="flex flex-col">
          {singleItem && isFolder(singleItem) && (
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onClose();
                onSmartClick(singleItem);
              }}
            >
              <FolderOpen className="h-4 w-4 text-amber-500" />
              <span>{t('open')}</span>
            </button>
          )}

          {config.pickCallback && singleItem && isSelectable(singleItem, config) && (
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onClose();
                config.pickCallback?.({
                  ...singleItem.model,
                  fullPath: () => getFullPath(singleItem.model),
                });
              }}
            >
              <Hand className="h-4 w-4 text-primary" />
              <span>{t('select_this')}</span>
            </button>
          )}

          {config.allowedActions.download && !hasDir && singleItem && (
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onClose();
                onDownload();
              }}
            >
              <Download className="h-4 w-4 text-sky-600" />
              <span>{t('download')}</span>
            </button>
          )}

          {config.allowedActions.downloadMultiple && !hasDir && !singleItem && (
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onClose();
                onDownload();
              }}
            >
              <Download className="h-4 w-4 text-sky-600" />
              <span>{t('download_as_zip')}</span>
            </button>
          )}

          {config.allowedActions.preview && singleItem && isImage(singleItem, config) && (
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onClose();
                onOpenImagePreview();
              }}
            >
              <Eye className="h-4 w-4 text-emerald-600" />
              <span>{t('view_item')}</span>
            </button>
          )}

          {config.allowedActions.rename && singleItem && (
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onClose();
                onOpenModal('rename');
              }}
            >
              <Edit3 className="h-4 w-4" />
              <span>{t('rename')}</span>
            </button>
          )}

          {config.allowedActions.move && (
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onClose();
                onOpenModal('move', true);
              }}
            >
              <ArrowRight className="h-4 w-4" />
              <span>{t('move')}</span>
            </button>
          )}

          {config.allowedActions.copy && !hasDir && (
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onClose();
                onOpenModal('copy', true);
              }}
            >
              <Copy className="h-4 w-4" />
              <span>{t('copy')}</span>
            </button>
          )}

          {config.allowedActions.edit && singleItem && isEditable(singleItem, config) && (
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onClose();
                onOpenEditItem();
              }}
            >
              <FileEdit className="h-4 w-4" />
              <span>{t('edit')}</span>
            </button>
          )}

          {config.allowedActions.changePermissions && (
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onClose();
                onOpenModal('changepermissions');
              }}
            >
              <Lock className="h-4 w-4" />
              <span>{t('permissions')}</span>
            </button>
          )}

          {config.allowedActions.compress && (!singleItem || hasDir) && (
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onClose();
                onOpenModal('compress', true);
              }}
            >
              <Archive className="h-4 w-4" />
              <span>{t('compress')}</span>
            </button>
          )}

          {config.allowedActions.extract && singleItem && isExtractable(singleItem, config) && (
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onClose();
                onOpenModal('extract', true);
              }}
            >
              <PackageOpen className="h-4 w-4" />
              <span>{t('extract')}</span>
            </button>
          )}

          {config.allowedActions.remove && (
            <>
              <div className="-mx-1 my-1 h-px bg-border" />
              <button
                type="button"
                className={`${itemClass} text-destructive hover:bg-destructive/10 hover:text-destructive`}
                onClick={() => {
                  onClose();
                  onOpenModal('remove');
                }}
              >
                <Trash2 className="h-4 w-4" />
                <span>{t('remove')}</span>
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col">
          {config.allowedActions.createFolder && (
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onClose();
                onOpenNewFolder();
              }}
            >
              <FolderPlus className="h-4 w-4 text-primary" />
              <span>{t('new_folder')}</span>
            </button>
          )}
          {config.allowedActions.upload && (
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onClose();
                onOpenModal('uploadfile');
              }}
            >
              <UploadCloud className="h-4 w-4 text-primary" />
              <span>{t('upload_files')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

