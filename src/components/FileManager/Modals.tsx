import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronRight,
  Folder,
  Hand,
  Loader2,
  Maximize2,
  Minimize2,
  Upload,
  X,
} from 'lucide-react';
import {
  ChmodState,
  FileItem,
  FileManagerConfig,
  ModalType,
  RwxEntry,
} from '@/types/filemanager';
import { chmodToCode, chmodToOctal, cloneChmod } from '@/lib/chmod';
import { createFileItem, getFullPath, isFolder } from '@/lib/item';
import { humanReadableFileSize, strLimit } from '@/lib/utils';
import { fileManagerApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ModalsProps {
  activeModal: ModalType;
  onCloseModal: () => void;
  config: FileManagerConfig;
  currentPath: string[];
  selectedItems: FileItem[];
  selectedModalPath: string[];
  onSelectedModalPathChange: (path: string[]) => void;
  inProcess: boolean;
  progress: number;
  apiError: string;
  asyncSuccess: boolean;
  editContent: string;
  onEditContentChange: (val: string) => void;
  uploadFileList: File[];
  onAddUploadFiles: (files: File[]) => void;
  onRemoveUploadFile: (index: number) => void;
  onConfirmRemove: () => void;
  onConfirmMove: () => void;
  onConfirmRename: (newName: string) => void;
  onConfirmCopy: (singleNewName?: string) => void;
  onConfirmCompress: (compressedName: string) => void;
  onConfirmExtract: (folderName: string) => void;
  onConfirmEdit: () => void;
  onConfirmCreateFolder: (folderName: string) => void;
  onConfirmUpload: () => void;
  onConfirmPermissions: (perms: ChmodState, recursive: boolean) => void;
  getPreviewUrl: (item: FileItem) => string;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const Modals: React.FC<ModalsProps> = ({
  activeModal,
  onCloseModal,
  config,
  currentPath,
  selectedItems,
  selectedModalPath,
  onSelectedModalPathChange,
  inProcess,
  progress,
  apiError,
  asyncSuccess,
  editContent,
  onEditContentChange,
  uploadFileList,
  onAddUploadFiles,
  onRemoveUploadFile,
  onConfirmRemove,
  onConfirmMove,
  onConfirmRename,
  onConfirmCopy,
  onConfirmCompress,
  onConfirmExtract,
  onConfirmEdit,
  onConfirmCreateFolder,
  onConfirmUpload,
  onConfirmPermissions,
  getPreviewUrl,
  t,
}) => {
  const singleItem = selectedItems.length === 1 ? selectedItems[0] : null;
  const hasDir = selectedItems.some((i) => i.model.type === 'dir');

  const [inputName, setInputName] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [permsState, setPermsState] = useState<ChmodState>(() =>
    createFileItem().model.perms
  );
  const [recursivePerms, setRecursivePerms] = useState(false);

  // Path Selector sub-modal state
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorPath, setSelectorPath] = useState<string[]>([]);
  const [selectorFolders, setSelectorFolders] = useState<FileItem[]>([]);
  const [selectorLoading, setSelectorLoading] = useState(false);
  const [selectorError, setSelectorError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setShowDetails(false);
    if (!activeModal) return;

    if (activeModal === 'rename' || activeModal === 'copy') {
      setInputName(singleItem ? singleItem.model.name : '');
    } else if (activeModal === 'compress') {
      setInputName(
        singleItem ? `${singleItem.model.name}.zip` : 'archive.zip'
      );
    } else if (activeModal === 'extract') {
      const base = singleItem
        ? singleItem.model.name.replace(/\.(gz|tar|rar|g?zip)$/i, '')
        : 'extracted';
      setInputName(base);
    } else if (activeModal === 'newfolder') {
      setInputName('');
    } else if (activeModal === 'changepermissions') {
      if (singleItem) {
        setPermsState(cloneChmod(singleItem.model.perms));
      } else {
        setPermsState(createFileItem({ rights: '644' }).model.perms);
      }
      setRecursivePerms(false);
    } else if (activeModal === 'imagepreview') {
      setImgLoading(true);
    }
  }, [activeModal, singleItem]);

  const loadSelectorFolders = async (pathArr: string[]) => {
    setSelectorLoading(true);
    setSelectorError('');
    try {
      const pathStr = '/' + pathArr.filter(Boolean).join('/');
      const rawList = await fileManagerApi.list(config.listUrl, pathStr, false);
      const folders = rawList
        .filter((r) => r.type === 'dir')
        .map((r) => createFileItem(r, pathArr))
        .sort((a, b) => a.model.name.localeCompare(b.model.name));
      setSelectorFolders(folders);
    } catch (err: any) {
      setSelectorError(err?.message || 'Error loading folders');
    } finally {
      setSelectorLoading(false);
    }
  };

  const openPathSelector = () => {
    const startPath = [...currentPath];
    setSelectorPath(startPath);
    setSelectorOpen(true);
    loadSelectorFolders(startPath);
  };

  const getSelectedDestinationDisplay = () => {
    const clean = selectedModalPath.filter(Boolean);
    let result = '/' + clean.join('/');
    if (singleItem && !isFolder(singleItem) && activeModal === 'copy' && inputName) {
      result += '/' + inputName;
    }
    return result.replace(/\/+/g, '/');
  };

  const isSelectedFileChildOf = (folderItem: FileItem) => {
    const folderFullPath = getFullPath(folderItem.model);
    return selectedItems.some((sel) => getFullPath(sel.model) === folderFullPath);
  };

  const renderErrorBar = () => {
    if (!apiError) return null;
    return (
      <div className="mt-3 flex items-center gap-2 rounded-md bg-destructive/15 px-3 py-2 text-xs font-medium text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{apiError}</span>
      </div>
    );
  };

  const renderSelectedFilesMsg = () => {
    if (selectedItems.length === 1) {
      return <b className="font-semibold">{selectedItems[0].model.name}</b>;
    }
    return (
      <span>
        {t('these_elements', { total: selectedItems.length })}{' '}
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="ml-1 inline-flex items-center rounded bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground"
        >
          {showDetails ? '-' : '+'} {t('details')}
        </button>
        {showDetails && (
          <ul className="mt-2 max-h-32 overflow-y-auto rounded border bg-muted/40 p-2 text-xs space-y-1">
            {selectedItems.map((item) => (
              <li key={item.id} className="font-medium">
                {item.model.name}
              </li>
            ))}
          </ul>
        )}
      </span>
    );
  };

  const renderPathSelectorBox = () => (
    <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs space-y-2">
      <div>
        <b className="font-semibold">{t('selection')}: </b>
        {renderSelectedFilesMsg()}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="truncate font-mono">
          <b className="font-sans font-semibold">{t('destination')}: </b>
          {getSelectedDestinationDisplay()}
        </div>
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-6 px-2 text-xs shrink-0"
          onClick={openPathSelector}
        >
          {t('change')}
        </Button>
      </div>
    </div>
  );

  const togglePermissionBit = (
    role: keyof ChmodState,
    bit: keyof RwxEntry,
    checked: boolean
  ) => {
    setPermsState((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [bit]: checked,
      },
    }));
  };

  return (
    <>
      {/* 1. Image Preview Modal */}
      <Dialog
        open={activeModal === 'imagepreview'}
        onOpenChange={(o) => !o && onCloseModal()}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('preview')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center min-h-[200px]">
            {singleItem && (
              <img
                src={getPreviewUrl(singleItem)}
                alt={singleItem.model.name}
                className="max-h-[65vh] max-w-full rounded object-contain"
                onLoad={() => setImgLoading(false)}
                onError={() => setImgLoading(false)}
              />
            )}
            {(imgLoading || inProcess) && (
              <Badge variant="secondary" className="mt-2">
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t('loading')}...
              </Badge>
            )}
            {renderErrorBar()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onCloseModal} disabled={inProcess}>
              {t('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Remove Modal */}
      <Dialog open={activeModal === 'remove'} onOpenChange={(o) => !o && onCloseModal()}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onConfirmRemove();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('confirm')}</DialogTitle>
            </DialogHeader>
            <div className="py-4 text-sm">
              {t('sure_to_delete')} {renderSelectedFilesMsg()}
              {renderErrorBar()}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onCloseModal}
                disabled={inProcess}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" variant="destructive" disabled={inProcess} autoFocus>
                {t('remove')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 3. Move Modal */}
      <Dialog open={activeModal === 'move'} onOpenChange={(o) => !o && onCloseModal()}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onConfirmMove();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('move')}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              {renderPathSelectorBox()}
              {renderErrorBar()}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onCloseModal}
                disabled={inProcess}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={inProcess}>
                {t('move')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 4. Rename Modal */}
      <Dialog open={activeModal === 'rename'} onOpenChange={(o) => !o && onCloseModal()}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onConfirmRename(inputName);
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('rename')}</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-2">
              <label className="text-sm">
                {t('enter_new_name_for')} <b>{singleItem?.model.name}</b>
              </label>
              <Input
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                autoFocus
              />
              {renderErrorBar()}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onCloseModal}
                disabled={inProcess}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={inProcess}>
                {t('rename')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 5. Copy Modal */}
      <Dialog open={activeModal === 'copy'} onOpenChange={(o) => !o && onCloseModal()}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onConfirmCopy(singleItem ? inputName : undefined);
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('copy_file')}</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-3">
              {singleItem && (
                <div className="space-y-1.5">
                  <label className="text-sm">
                    {t('enter_new_name_for')} <b>{singleItem.model.name}</b>
                  </label>
                  <Input
                    value={inputName}
                    onChange={(e) => setInputName(e.target.value)}
                    autoFocus
                  />
                </div>
              )}
              {renderPathSelectorBox()}
              {renderErrorBar()}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onCloseModal}
                disabled={inProcess}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={inProcess}>
                {t('copy')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 6. Compress Modal */}
      <Dialog
        open={activeModal === 'compress'}
        onOpenChange={(o) => !o && onCloseModal()}
      >
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onConfirmCompress(inputName);
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('compress')}</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-3">
              {asyncSuccess ? (
                <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
                  {t('compression_started')}
                </div>
              ) : (
                <>
                  {!config.allowedActions.compressChooseName ? (
                    <p className="text-sm">
                      {t('sure_to_start_compression_with')}{' '}
                      <b>{singleItem?.model.name}</b> ?
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-sm">
                        {t('enter_file_name_for_compression')}{' '}
                        {renderSelectedFilesMsg()}
                      </label>
                      <Input
                        value={inputName}
                        onChange={(e) => setInputName(e.target.value)}
                        autoFocus
                      />
                    </div>
                  )}
                  {renderPathSelectorBox()}
                </>
              )}
              {renderErrorBar()}
            </div>
            <DialogFooter>
              {asyncSuccess ? (
                <Button type="button" variant="outline" onClick={onCloseModal}>
                  {t('close')}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onCloseModal}
                    disabled={inProcess}
                  >
                    {t('cancel')}
                  </Button>
                  <Button type="submit" disabled={inProcess}>
                    {t('compress')}
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 7. Extract Modal */}
      <Dialog
        open={activeModal === 'extract'}
        onOpenChange={(o) => !o && onCloseModal()}
      >
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onConfirmExtract(inputName);
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('extract_item')}</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-3">
              {asyncSuccess ? (
                <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
                  {t('extraction_started')}
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm">
                      {t('enter_folder_name_for_extraction')}{' '}
                      <b>{singleItem?.model.name}</b>
                    </label>
                    <Input
                      value={inputName}
                      onChange={(e) => setInputName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  {renderPathSelectorBox()}
                </>
              )}
              {renderErrorBar()}
            </div>
            <DialogFooter>
              {asyncSuccess ? (
                <Button type="button" variant="outline" onClick={onCloseModal}>
                  {t('close')}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onCloseModal}
                    disabled={inProcess}
                  >
                    {t('cancel')}
                  </Button>
                  <Button type="submit" disabled={inProcess}>
                    {t('extract')}
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 8. Edit File Modal */}
      <Dialog open={activeModal === 'edit'} onOpenChange={(o) => !o && onCloseModal()}>
        <DialogContent
          className={
            fullscreen
              ? 'max-w-[96vw] w-[96vw] h-[92vh] flex flex-col'
              : 'max-w-3xl'
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onConfirmEdit();
            }}
            className="flex flex-col flex-1 gap-3"
          >
            <DialogHeader className="flex flex-row items-center justify-between pr-8">
              <DialogTitle>{t('edit_file')}</DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setFullscreen((v) => !v)}
                title={t('toggle_fullscreen')}
              >
                {fullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
            </DialogHeader>

            <div className="flex flex-col flex-1 gap-2">
              <div className="text-xs font-mono font-semibold text-muted-foreground">
                {singleItem && getFullPath(singleItem.model)}
              </div>
              {inProcess ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
                  <span className="text-sm">{t('loading')}...</span>
                </div>
              ) : (
                <textarea
                  value={editContent}
                  onChange={(e) => onEditContentChange(e.target.value)}
                  className={`w-full rounded-md border bg-slate-950 text-slate-100 p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring ${
                    fullscreen ? 'flex-1 min-h-[65vh]' : 'h-80'
                  }`}
                  autoFocus
                />
              )}
              {renderErrorBar()}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onCloseModal}
                disabled={inProcess}
              >
                {t('close')}
              </Button>
              {config.allowedActions.edit && (
                <Button type="submit" disabled={inProcess}>
                  {t('save')}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 9. New Folder Modal */}
      <Dialog
        open={activeModal === 'newfolder'}
        onOpenChange={(o) => !o && onCloseModal()}
      >
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onConfirmCreateFolder(inputName);
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('new_folder')}</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-2">
              <label className="text-sm">{t('folder_name')}</label>
              <Input
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                autoFocus
              />
              {renderErrorBar()}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onCloseModal}
                disabled={inProcess}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={inProcess}>
                {t('create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 10. Upload File Modal */}
      <Dialog
        open={activeModal === 'uploadfile'}
        onOpenChange={(o) => !o && onCloseModal()}
      >
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onConfirmUpload();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('upload_files')}</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <div className="text-sm">
                {t('files_will_uploaded_to')} <b>/{currentPath.join('/')}</b>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onAddUploadFiles(Array.from(e.target.files));
                    e.target.value = '';
                  }
                }}
              />

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {t('select_files')}
              </Button>

              {uploadFileList.length > 0 && (
                <ul className="max-h-48 overflow-y-auto divide-y rounded-md border">
                  {uploadFileList.map((f, idx) => (
                    <li
                      key={`${f.name}-${idx}`}
                      className="flex items-center justify-between px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium truncate">{f.name}</div>
                        <div className="text-muted-foreground">
                          {humanReadableFileSize(f.size, config.useBinarySizePrefixes)}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => onRemoveUploadFile(idx)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {inProcess && (
                <div className="space-y-1">
                  <div className="text-xs italic text-muted-foreground">
                    {t('uploading')}... {progress}%
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full bg-primary transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {renderErrorBar()}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onCloseModal}
                disabled={inProcess}
              >
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={uploadFileList.length === 0 || inProcess}
              >
                {t('upload')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 11. Change Permissions Modal */}
      <Dialog
        open={activeModal === 'changepermissions'}
        onOpenChange={(o) => !o && onCloseModal()}
      >
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onConfirmPermissions(permsState, recursivePerms);
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('change_permissions')}</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="py-2 text-left">{t('permissions')}</th>
                    <th className="py-2 text-center">{t('read')}</th>
                    <th className="py-2 text-center">{t('write')}</th>
                    <th className="py-2 text-center">{t('exec')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(['owner', 'group', 'others'] as (keyof ChmodState)[]).map(
                    (role) => (
                      <tr key={role}>
                        <td className="py-2.5 font-medium capitalize">{t(role)}</td>
                        {(['read', 'write', 'exec'] as (keyof RwxEntry)[]).map(
                          (bit) => (
                            <td key={bit} className="py-2.5 text-center">
                              <Checkbox
                                checked={permsState[role][bit]}
                                onCheckedChange={(checked) =>
                                  togglePermissionBit(role, bit, Boolean(checked))
                                }
                              />
                            </td>
                          )
                        )}
                      </tr>
                    )
                  )}
                </tbody>
              </table>

              {config.enablePermissionsRecursive && hasDir && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={recursivePerms}
                    onCheckedChange={(c) => setRecursivePerms(Boolean(c))}
                  />
                  <span>{t('recursive')}</span>
                </label>
              )}

              <div className="flex items-center justify-between gap-2 text-xs">
                {singleItem && (
                  <Badge variant="secondary" className="font-mono">
                    {t('original')}:{' '}
                    {chmodToCode(singleItem.model.perms, hasDir ? 'd' : '-')} (
                    {chmodToOctal(singleItem.model.perms)})
                  </Badge>
                )}
                <Badge variant="default" className="font-mono ml-auto">
                  {t('changes')}: {chmodToCode(permsState, hasDir ? 'd' : '-')} (
                  {chmodToOctal(permsState)})
                </Badge>
              </div>

              {renderErrorBar()}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onCloseModal}
                disabled={inProcess}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={inProcess}>
                {t('change')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 12. Destination Folder Selector Sub-Modal */}
      <Dialog open={selectorOpen} onOpenChange={setSelectorOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('select_destination_folder')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* Breadcrumb inside selector */}
            <div className="flex items-center flex-wrap gap-1 rounded-md bg-muted px-3 py-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setSelectorPath([]);
                  loadSelectorFolders([]);
                }}
                className="font-semibold text-primary hover:underline"
              >
                {t('filemanager')}
              </button>
              {selectorPath.map((dir, idx) => {
                const isLast = idx === selectorPath.length - 1;
                return (
                  <React.Fragment key={`${dir}-${idx}`}>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    {isLast ? (
                      <span className="font-medium">{strLimit(dir, 16)}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const next = selectorPath.slice(0, idx + 1);
                          setSelectorPath(next);
                          loadSelectorFolders(next);
                        }}
                        className="text-primary hover:underline"
                      >
                        {strLimit(dir, 14)}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            <div className="max-h-64 overflow-y-auto rounded-md border">
              {selectorLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : selectorError ? (
                <div className="p-4 text-xs text-destructive">{selectorError}</div>
              ) : selectorFolders.length === 0 ? (
                <div className="flex items-center justify-between p-4 text-xs text-muted-foreground">
                  <span>{t('no_folders_in_folder')}...</span>
                  {selectorPath.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const up = selectorPath.slice(0, -1);
                        setSelectorPath(up);
                        loadSelectorFolders(up);
                      }}
                    >
                      {t('go_back')}
                    </Button>
                  )}
                </div>
              ) : (
                <table className="w-full text-xs">
                  <tbody className="divide-y">
                    {selectorFolders
                      .filter((f) => !isSelectedFileChildOf(f))
                      .map((folder) => (
                        <tr key={folder.id} className="hover:bg-accent/50">
                          <td className="py-2 px-3">
                            <button
                              type="button"
                              onClick={() => {
                                const next = getFullPath(folder.model)
                                  .split('/')
                                  .filter(Boolean);
                                setSelectorPath(next);
                                loadSelectorFolders(next);
                              }}
                              className="flex items-center gap-2 font-medium hover:text-primary"
                            >
                              <Folder className="h-4 w-4 text-amber-500" />
                              <span>{strLimit(folder.model.name, 36)}</span>
                            </button>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => {
                                const next = getFullPath(folder.model)
                                  .split('/')
                                  .filter(Boolean);
                                onSelectedModalPathChange(next);
                                setSelectorOpen(false);
                              }}
                            >
                              <Hand className="h-3.5 w-3.5 mr-1" />
                              {t('select_this')}
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>

            <div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  onSelectedModalPathChange([...selectorPath]);
                  setSelectorOpen(false);
                }}
              >
                <Hand className="h-3.5 w-3.5 mr-1.5" />
                {t('select_this')} (/{selectorPath.join('/')})
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectorOpen(false)}
            >
              {t('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

