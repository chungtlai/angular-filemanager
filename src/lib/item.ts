import { FileItem, FileManagerConfig, FileModel, RawFileModel } from '@/types/filemanager';
import { cloneChmod, createChmod } from './chmod';

export function parseBackendDate(dateStr?: string): Date {
  if (!dateStr) return new Date();
  const parts = String(dateStr).trim().split(/[- :]/);
  if (parts.length >= 6) {
    const parsed = new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2]),
      Number(parts[3]),
      Number(parts[4]),
      Number(parts[5])
    );
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  const fallback = new Date(dateStr);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

export function getFullPath(model: Pick<FileModel, 'path' | 'name'>): string {
  const cleanPath = (model.path || []).filter(Boolean);
  return ('/' + cleanPath.join('/') + '/' + model.name).replace(/\/+/g, '/');
}

export function cloneFileModel(model: FileModel): FileModel {
  return {
    ...model,
    path: [...model.path],
    date: new Date(model.date.getTime()),
    perms: cloneChmod(model.perms),
  };
}

export function createFileItem(raw?: Partial<RawFileModel> | null, currentPath: string[] = []): FileItem {
  const baseModel: FileModel = {
    name: raw?.name || '',
    path: [...currentPath],
    type: raw?.type || 'file',
    size: Number(raw?.size || 0),
    date: parseBackendDate(raw?.date),
    perms: createChmod(raw?.rights || '644'),
    content: raw?.content || '',
    recursive: false,
  };

  return {
    id: `${getFullPath(baseModel)}-${baseModel.type}`,
    model: cloneFileModel(baseModel),
    tempModel: cloneFileModel(baseModel),
    error: '',
    processing: false,
  };
}

export function isFolder(item: FileItem): boolean {
  return item.model.type === 'dir';
}

export function isEditable(item: FileItem, config: FileManagerConfig): boolean {
  return !isFolder(item) && config.isEditableFilePattern.test(item.model.name);
}

export function isImage(item: FileItem, config: FileManagerConfig): boolean {
  return !isFolder(item) && config.isImageFilePattern.test(item.model.name);
}

export function isCompressible(item: FileItem): boolean {
  return isFolder(item);
}

export function isExtractable(item: FileItem, config: FileManagerConfig): boolean {
  return !isFolder(item) && config.isExtractableFilePattern.test(item.model.name);
}

export function isSelectable(item: FileItem, config: FileManagerConfig): boolean {
  return (
    (isFolder(item) && config.allowedActions.pickFolders) ||
    (!isFolder(item) && config.allowedActions.pickFiles)
  );
}

