import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  ChmodState,
  FileItem,
  FileManagerConfig,
  ModalType,
  TreeNode,
} from '@/types/filemanager';
import { defaultConfig } from '@/config/defaultConfig';
import { useTranslation } from '@/i18n/useTranslation';
import { chmodToCode, chmodToOctal } from '@/lib/chmod';
import {
  createFileItem,
  getFullPath,
  isEditable,
  isFolder,
  isImage,
} from '@/lib/item';
import { fileManagerApi } from '@/services/api';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { FileTableView, SortField } from './FileTableView';
import { FileIconView } from './FileIconView';
import { ContextMenuPosition, FileContextMenu } from './FileContextMenu';
import { Modals } from './Modals';

export interface FileManagerProps {
  config?: Partial<FileManagerConfig>;
}

function getBasePathArray(basePathStr?: string): string[] {
  const clean = (basePathStr || '').replace(/^\//, '').trim();
  return clean ? clean.split('/').filter(Boolean) : [];
}

function updateTreeHistory(
  prevHistory: TreeNode[],
  basePath: string[],
  currentPath: string[],
  fileList: FileItem[]
): TreeNode[] {
  const pathStr = currentPath.join('/');
  const rootName = basePath[0] || '';
  const root: TreeNode = prevHistory.length
    ? structuredClone(prevHistory[0])
    : { name: rootName, item: null, nodes: [] };

  const flatNodes: TreeNode[] = [];
  const flatten = (node: TreeNode) => {
    flatNodes.push(node);
    node.nodes.forEach(flatten);
  };
  flatten(root);

  const selectedNode = flatNodes.find((n) => n.name === pathStr);
  if (selectedNode) {
    selectedNode.nodes = [];
  }

  const insertRecursive = (parent: TreeNode, item: FileItem, targetPath: string) => {
    const absName = targetPath ? `${targetPath}/${item.model.name}` : item.model.name;
    if (
      parent.name &&
      parent.name.trim() &&
      targetPath.trim().indexOf(parent.name) !== 0
    ) {
      parent.nodes = [];
    }
    if (parent.name !== targetPath) {
      parent.nodes.forEach((child) => insertRecursive(child, item, targetPath));
    } else {
      if (!parent.nodes.some((n) => n.name === absName)) {
        parent.nodes.push({
          name: absName,
          item,
          nodes: [],
        });
      }
    }
    parent.nodes.sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
  };

  fileList.forEach((item) => {
    if (isFolder(item)) {
      insertRecursive(root, item, pathStr);
    }
  });

  return [root];
}

export const FileManager: React.FC<FileManagerProps> = ({ config: userConfig }) => {
  const config: FileManagerConfig = useMemo(
    () => ({
      ...defaultConfig,
      ...userConfig,
      allowedActions: {
        ...defaultConfig.allowedActions,
        ...(userConfig?.allowedActions || {}),
      },
    }),
    [userConfig]
  );

  const basePath = useMemo(() => getBasePathArray(config.basePath), [config.basePath]);

  const [language, setLanguage] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('lang') ||
      localStorage.getItem('language') ||
      config.defaultLang ||
      'en'
    );
  });

  const { t } = useTranslation(language);

  const [viewMode, setViewMode] = useState<'icons' | 'table'>(() => {
    const saved = localStorage.getItem('viewTemplate');
    return saved === 'main-table.html' || saved === 'table' ? 'table' : 'icons';
  });

  const [currentPath, setCurrentPath] = useState<string[]>(basePath);
  const [fileList, setFileList] = useState<FileItem[]>([]);
  const [history, setHistory] = useState<TreeNode[]>([]);
  const [requesting, setRequesting] = useState<boolean>(false);
  const [navError, setNavError] = useState<string>('');

  const [query, setQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [reverse, setReverse] = useState<boolean>(false);

  const [selectedItems, setSelectedItems] = useState<FileItem[]>([]);
  const [selectedModalPath, setSelectedModalPath] = useState<string[]>([]);

  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [inProcess, setInProcess] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [apiError, setApiError] = useState<string>('');
  const [asyncSuccess, setAsyncSuccess] = useState<boolean>(false);
  const [editContent, setEditContent] = useState<string>('');
  const [uploadFileList, setUploadFileList] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const [contextMenuPos, setContextMenuPos] = useState<ContextMenuPosition | null>(null);

  const handleLanguageChange = (lang: string) => {
    localStorage.setItem('language', lang);
    setLanguage(lang);
  };

  const handleViewModeChange = (mode: 'icons' | 'table') => {
    localStorage.setItem(
      'viewTemplate',
      mode === 'table' ? 'main-table.html' : 'main-icons.html'
    );
    setViewMode(mode);
  };

  const refresh = useCallback(
    async (pathToLoad: string[] = currentPath) => {
      const effectivePath = pathToLoad.length ? pathToLoad : basePath;
      const apiPath = '/' + effectivePath.join('/');
      setRequesting(true);
      setNavError('');
      try {
        const rawItems = await fileManagerApi.list(
          config.listUrl,
          apiPath,
          false,
          config.filterFileExtensions
        );
        const mapped = rawItems.map((raw) => createFileItem(raw, effectivePath));
        setFileList(mapped);
        setHistory((prev) => updateTreeHistory(prev, basePath, effectivePath, mapped));
        setSelectedItems([]);
        setQuery('');
        setSelectedModalPath(effectivePath);
      } catch (err: any) {
        setFileList([]);
        setNavError(err?.message || 'Error listing directory');
      } finally {
        setRequesting(false);
      }
    },
    [basePath, config.filterFileExtensions, config.listUrl, currentPath]
  );

  useEffect(() => {
    refresh(currentPath);
  }, [currentPath]);

  // Filtered and sorted items
  const displayedItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? fileList.filter((item) => item.model.name.toLowerCase().includes(q))
      : [...fileList];

    filtered.sort((a, b) => {
      // Group folders before files just like predicate ['model.type', 'model.name']
      if (a.model.type !== b.model.type) {
        const typeCmp = a.model.type.localeCompare(b.model.type);
        return reverse ? -typeCmp : typeCmp;
      }
      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.model.name.localeCompare(b.model.name);
      } else if (sortField === 'size') {
        cmp = a.model.size - b.model.size;
      } else if (sortField === 'date') {
        cmp = a.model.date.getTime() - b.model.date.getTime();
      } else if (sortField === 'permissions') {
        cmp = chmodToCode(a.model.perms).localeCompare(chmodToCode(b.model.perms));
      }
      return reverse ? -cmp : cmp;
    });

    return filtered;
  }, [fileList, query, sortField, reverse]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setReverse((r) => !r);
    } else {
      setSortField(field);
      setReverse(false);
    }
  };

  const isSelected = useCallback(
    (item: FileItem) => selectedItems.some((s) => s.id === item.id),
    [selectedItems]
  );

  const selectOrUnselect = (
    item: FileItem | null,
    e: React.MouseEvent,
    isRightClick = false
  ) => {
    if (!item) {
      setSelectedItems([]);
      return;
    }
    if (isRightClick && isSelected(item)) {
      return;
    }

    if (e.shiftKey && !isRightClick && selectedItems.length > 0) {
      const lastSelected = selectedItems[0];
      const startIdx = displayedItems.findIndex((i) => i.id === lastSelected.id);
      const endIdx = displayedItems.findIndex((i) => i.id === item.id);
      if (startIdx !== -1 && endIdx !== -1) {
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
        setSelectedItems(displayedItems.slice(min, max + 1));
        return;
      }
    }

    if (!isRightClick && (e.ctrlKey || e.metaKey)) {
      if (isSelected(item)) {
        setSelectedItems((prev) => prev.filter((i) => i.id !== item.id));
      } else {
        setSelectedItems((prev) => [...prev, item]);
      }
      return;
    }

    setSelectedItems([item]);
  };

  const openModal = (modal: ModalType, withPathSelector = false) => {
    setApiError('');
    setAsyncSuccess(false);
    if (withPathSelector) {
      setSelectedModalPath([...currentPath]);
    }
    setActiveModal(modal);
  };

  const closeModal = () => {
    setActiveModal(null);
    setApiError('');
    setAsyncSuccess(false);
  };

  const handleFolderClick = (item: FileItem | null) => {
    if (!item) {
      setCurrentPath([...basePath]);
      return;
    }
    if (isFolder(item)) {
      const next = getFullPath(item.model).split('/').filter(Boolean);
      setCurrentPath(next);
    }
  };

  const handleUpDir = () => {
    if (currentPath.length > 0) {
      setCurrentPath((prev) => prev.slice(0, -1));
    }
  };

  const handleGoTo = (index: number) => {
    if (index < 0) {
      setCurrentPath([]);
    } else {
      setCurrentPath((prev) => prev.slice(0, index + 1));
    }
  };

  const handleOpenEditItem = async (targetItem?: FileItem) => {
    const item = targetItem || (selectedItems.length === 1 ? selectedItems[0] : null);
    if (!item) return;
    openModal('edit');
    setInProcess(true);
    try {
      const content = await fileManagerApi.getContent(
        config.getContentUrl,
        getFullPath(item.model),
        t('error_getting_content')
      );
      setEditContent(content ?? '');
    } catch (err: any) {
      setApiError(err?.message || t('error_getting_content'));
    } finally {
      setInProcess(false);
    }
  };

  const handleDownload = async (targetItem?: FileItem) => {
    const items = targetItem ? [targetItem] : selectedItems;
    if (items.length === 0 || items.some((i) => i.model.type === 'dir')) return;

    setInProcess(true);
    try {
      if (items.length === 1) {
        const single = items[0];
        await fileManagerApi.download(
          config.downloadFileUrl,
          getFullPath(single.model),
          single.model.name,
          config.downloadFilesByAjax
        );
      } else {
        const timestamp = Date.now().toString().slice(-5);
        const toFilename = `${timestamp}-${config.multipleDownloadFileName}`;
        await fileManagerApi.downloadMultiple(
          config.downloadMultipleUrl,
          items.map((i) => getFullPath(i.model)),
          toFilename,
          config.downloadFilesByAjax
        );
      }
    } catch (err: any) {
      setNavError(err?.message || t('error_downloading'));
    } finally {
      setInProcess(false);
    }
  };

  const handleSmartClick = (item: FileItem) => {
    if (isFolder(item)) {
      handleFolderClick(item);
      return;
    }
    if (config.allowedActions.pickFiles && typeof config.pickCallback === 'function') {
      const handled = config.pickCallback({
        ...item.model,
        fullPath: () => getFullPath(item.model),
      });
      if (handled === true) return;
    }
    if (isImage(item, config)) {
      if (config.previewImagesInModal) {
        setSelectedItems([item]);
        openModal('imagepreview');
        return;
      }
      handleDownload(item);
      return;
    }
    if (isEditable(item, config)) {
      setSelectedItems([item]);
      handleOpenEditItem(item);
    }
  };

  const fileNameExists = (name: string) => {
    const clean = name.trim();
    return fileList.some((i) => i.model.name.trim() === clean);
  };

  const validateSamePath = (item?: FileItem | null) => {
    if (!item) return false;
    return item.model.path.join('') === selectedModalPath.join('');
  };

  // Action Confirm Handlers
  const handleConfirmRemove = async () => {
    setInProcess(true);
    setApiError('');
    try {
      await fileManagerApi.remove(
        config.removeUrl,
        selectedItems.map((i) => getFullPath(i.model)),
        t('error_deleting')
      );
      closeModal();
      await refresh();
    } catch (err: any) {
      setApiError(err?.message || t('error_deleting'));
    } finally {
      setInProcess(false);
    }
  };

  const handleConfirmMove = async () => {
    const anyItem = selectedItems[0];
    if (anyItem && validateSamePath(anyItem)) {
      setApiError(t('error_cannot_move_same_path'));
      return;
    }
    setInProcess(true);
    setApiError('');
    try {
      await fileManagerApi.move(
        config.moveUrl,
        selectedItems.map((i) => getFullPath(i.model)),
        '/' + selectedModalPath.join('/'),
        t('error_moving')
      );
      closeModal();
      await refresh();
    } catch (err: any) {
      setApiError(err?.message || t('error_moving'));
    } finally {
      setInProcess(false);
    }
  };

  const handleConfirmRename = async (newName: string) => {
    const single = selectedItems[0];
    if (!single) return;
    const trimmed = newName.trim();
    if (!trimmed || fileNameExists(trimmed)) {
      setApiError(t('error_invalid_filename'));
      return;
    }
    setInProcess(true);
    setApiError('');
    try {
      const newPath = getFullPath({ path: single.model.path, name: trimmed });
      await fileManagerApi.rename(
        config.renameUrl,
        getFullPath(single.model),
        newPath,
        t('error_renaming')
      );
      closeModal();
      await refresh();
    } catch (err: any) {
      setApiError(err?.message || t('error_renaming'));
    } finally {
      setInProcess(false);
    }
  };

  const handleConfirmCopy = async (singleNewName?: string) => {
    const single = selectedItems.length === 1 ? selectedItems[0] : null;
    if (single) {
      const trimmed = (singleNewName || '').trim();
      if (!trimmed || (fileNameExists(trimmed) && validateSamePath(single))) {
        setApiError(t('error_invalid_filename'));
        return;
      }
    }
    setInProcess(true);
    setApiError('');
    try {
      await fileManagerApi.copy(
        config.copyUrl,
        selectedItems.map((i) => getFullPath(i.model)),
        '/' + selectedModalPath.join('/'),
        singleNewName?.trim(),
        t('error_copying')
      );
      closeModal();
      await refresh();
    } catch (err: any) {
      setApiError(err?.message || t('error_copying'));
    } finally {
      setInProcess(false);
    }
  };

  const handleConfirmCompress = async (compressedName: string) => {
    const trimmed = compressedName.trim();
    if (!trimmed || (fileNameExists(trimmed) && validateSamePath(selectedItems[0]))) {
      setApiError(t('error_invalid_filename'));
      return;
    }
    setInProcess(true);
    setApiError('');
    try {
      await fileManagerApi.compress(
        config.compressUrl,
        selectedItems.map((i) => getFullPath(i.model)),
        trimmed,
        '/' + selectedModalPath.join('/'),
        t('error_compressing')
      );
      await refresh();
      if (!config.compressAsync) {
        closeModal();
      } else {
        setAsyncSuccess(true);
      }
    } catch (err: any) {
      setAsyncSuccess(false);
      setApiError(err?.message || t('error_compressing'));
    } finally {
      setInProcess(false);
    }
  };

  const handleConfirmExtract = async (folderName: string) => {
    const single = selectedItems[0];
    if (!single) return;
    const trimmed = folderName.trim();
    if (!trimmed || (fileNameExists(trimmed) && validateSamePath(single))) {
      setApiError(t('error_invalid_filename'));
      return;
    }
    setInProcess(true);
    setApiError('');
    try {
      await fileManagerApi.extract(
        config.extractUrl,
        getFullPath(single.model),
        trimmed,
        '/' + selectedModalPath.join('/'),
        t('error_extracting')
      );
      await refresh();
      if (!config.extractAsync) {
        closeModal();
      } else {
        setAsyncSuccess(true);
      }
    } catch (err: any) {
      setAsyncSuccess(false);
      setApiError(err?.message || t('error_extracting'));
    } finally {
      setInProcess(false);
    }
  };

  const handleConfirmEdit = async () => {
    const single = selectedItems[0];
    if (!single) return;
    setInProcess(true);
    setApiError('');
    try {
      await fileManagerApi.edit(
        config.editUrl,
        getFullPath(single.model),
        editContent,
        t('error_modifying')
      );
      closeModal();
    } catch (err: any) {
      setApiError(err?.message || t('error_modifying'));
    } finally {
      setInProcess(false);
    }
  };

  const handleConfirmCreateFolder = async (folderName: string) => {
    const trimmed = folderName.trim();
    if (!trimmed || fileNameExists(trimmed)) {
      setApiError(t('error_invalid_filename'));
      return;
    }
    setInProcess(true);
    setApiError('');
    try {
      const fullPath = getFullPath({ path: currentPath, name: trimmed });
      await fileManagerApi.createFolder(
        config.createFolderUrl,
        fullPath,
        t('error_creating_folder')
      );
      closeModal();
      await refresh();
    } catch (err: any) {
      setApiError(err?.message || t('error_creating_folder'));
    } finally {
      setInProcess(false);
    }
  };

  const handleConfirmUpload = async () => {
    if (uploadFileList.length === 0) return;
    setInProcess(true);
    setProgress(0);
    setApiError('');
    try {
      await fileManagerApi.upload(
        config.uploadUrl,
        '/' + currentPath.join('/'),
        uploadFileList,
        (pct) => setProgress(pct)
      );
      setUploadFileList([]);
      closeModal();
      await refresh();
    } catch (err: any) {
      setApiError(err?.message || t('error_uploading_files'));
    } finally {
      setInProcess(false);
      setProgress(0);
    }
  };

  const handleConfirmPermissions = async (
    perms: ChmodState,
    recursive: boolean
  ) => {
    setInProcess(true);
    setApiError('');
    try {
      await fileManagerApi.changePermissions(
        config.permissionsUrl,
        selectedItems.map((i) => getFullPath(i.model)),
        chmodToCode(perms),
        chmodToOctal(perms),
        recursive,
        t('error_changing_perms')
      );
      closeModal();
      await refresh();
    } catch (err: any) {
      setApiError(err?.message || t('error_changing_perms'));
    } finally {
      setInProcess(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar
        config={config}
        currentPath={currentPath}
        query={query}
        onQueryChange={setQuery}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        language={language}
        onLanguageChange={handleLanguageChange}
        onGoTo={handleGoTo}
        onUpDir={handleUpDir}
        onRefresh={() => refresh(currentPath)}
        onOpenNewFolder={() => openModal('newfolder')}
        onOpenUpload={() => openModal('uploadfile')}
        t={t}
      />

      <div className="flex flex-1 flex-col sm:flex-row overflow-hidden">
        {config.sidebar && history.length > 0 && (
          <Sidebar
            history={history}
            currentPath={currentPath}
            basePath={basePath}
            onFolderClick={handleFolderClick}
          />
        )}

        <main
          className={`flex-1 overflow-y-auto transition-colors ${
            isDragOver ? 'bg-primary/5 ring-2 ring-inset ring-primary' : ''
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            if (config.allowedActions.upload) {
              setIsDragOver(true);
            }
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (!config.allowedActions.upload) return;
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              const dropped = Array.from(e.dataTransfer.files);
              setUploadFileList((prev) => [...prev, ...dropped]);
              openModal('uploadfile');
            }
          }}
        >
          {viewMode === 'table' ? (
            <FileTableView
              config={config}
              items={displayedItems}
              requesting={requesting}
              error={navError}
              sortField={sortField}
              reverse={reverse}
              onSort={handleSort}
              isSelected={isSelected}
              onSelect={selectOrUnselect}
              onSmartClick={handleSmartClick}
              onContextMenuOpen={(e) =>
                setContextMenuPos({ x: e.clientX, y: e.clientY })
              }
              t={t}
            />
          ) : (
            <FileIconView
              config={config}
              items={displayedItems}
              requesting={requesting}
              error={navError}
              isSelected={isSelected}
              onSelect={selectOrUnselect}
              onSmartClick={handleSmartClick}
              onContextMenuOpen={(e) =>
                setContextMenuPos({ x: e.clientX, y: e.clientY })
              }
              t={t}
            />
          )}
        </main>
      </div>

      <FileContextMenu
        position={contextMenuPos}
        onClose={() => setContextMenuPos(null)}
        config={config}
        selectedItems={selectedItems}
        onSmartClick={handleSmartClick}
        onDownload={() => handleDownload()}
        onOpenImagePreview={() => openModal('imagepreview')}
        onOpenEditItem={() => handleOpenEditItem()}
        onOpenModal={openModal}
        onOpenNewFolder={() => openModal('newfolder')}
        t={t}
      />

      <Modals
        activeModal={activeModal}
        onCloseModal={closeModal}
        config={config}
        currentPath={currentPath}
        selectedItems={selectedItems}
        selectedModalPath={selectedModalPath}
        onSelectedModalPathChange={setSelectedModalPath}
        inProcess={inProcess}
        progress={progress}
        apiError={apiError}
        asyncSuccess={asyncSuccess}
        editContent={editContent}
        onEditContentChange={setEditContent}
        uploadFileList={uploadFileList}
        onAddUploadFiles={(files) =>
          setUploadFileList((prev) => [...prev, ...files])
        }
        onRemoveUploadFile={(idx) =>
          setUploadFileList((prev) => prev.filter((_, i) => i !== idx))
        }
        onConfirmRemove={handleConfirmRemove}
        onConfirmMove={handleConfirmMove}
        onConfirmRename={handleConfirmRename}
        onConfirmCopy={handleConfirmCopy}
        onConfirmCompress={handleConfirmCompress}
        onConfirmExtract={handleConfirmExtract}
        onConfirmEdit={handleConfirmEdit}
        onConfirmCreateFolder={handleConfirmCreateFolder}
        onConfirmUpload={handleConfirmUpload}
        onConfirmPermissions={handleConfirmPermissions}
        getPreviewUrl={(item) =>
          fileManagerApi.getDownloadUrl(
            config.downloadFileUrl,
            getFullPath(item.model),
            true
          )
        }
        t={t}
      />

      {inProcess && !activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[1px] select-none"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-background px-8 py-6 shadow-lg">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-sm font-medium text-foreground">
              {selectedItems.length > 1 ? t('download_as_zip') : t('download')} — {t('loading')}...
            </div>
            {selectedItems.length > 1 && (
              <div className="text-xs text-muted-foreground">
                {t('these_elements', { total: selectedItems.length })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

