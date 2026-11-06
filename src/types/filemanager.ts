export interface RwxEntry {
  read: boolean;
  write: boolean;
  exec: boolean;
}

export interface ChmodState {
  owner: RwxEntry;
  group: RwxEntry;
  others: RwxEntry;
}

export interface RawFileModel {
  name: string;
  rights: string;
  size: number | string;
  date: string;
  type: 'dir' | 'file';
  content?: string;
}

export interface FileModel {
  name: string;
  path: string[];
  type: 'dir' | 'file';
  size: number;
  date: Date;
  perms: ChmodState;
  content: string;
  recursive: boolean;
}

export interface FileItem {
  id: string;
  model: FileModel;
  tempModel: FileModel;
  error: string;
  processing: boolean;
  multiple?: boolean;
}

export interface TreeNode {
  name: string;
  item: FileItem | null;
  nodes: TreeNode[];
}

export interface AllowedActions {
  upload: boolean;
  rename: boolean;
  move: boolean;
  copy: boolean;
  edit: boolean;
  changePermissions: boolean;
  compress: boolean;
  compressChooseName: boolean;
  extract: boolean;
  download: boolean;
  downloadMultiple: boolean;
  preview: boolean;
  remove: boolean;
  createFolder: boolean;
  pickFiles: boolean;
  pickFolders: boolean;
}

export type StorageBackend = 'local' | 'minio';

export interface FileManagerConfig {
  appName: string;
  defaultLang: string;
  multiLang: boolean;
  minioUrl?: string;
  listUrl: string;
  uploadUrl: string;
  renameUrl: string;
  copyUrl: string;
  moveUrl: string;
  removeUrl: string;
  editUrl: string;
  getContentUrl: string;
  createFolderUrl: string;
  downloadFileUrl: string;
  downloadMultipleUrl: string;
  compressUrl: string;
  extractUrl: string;
  permissionsUrl: string;
  basePath: string;
  searchForm: boolean;
  sidebar: boolean;
  breadcrumb: boolean;
  allowedActions: AllowedActions;
  multipleDownloadFileName: string;
  filterFileExtensions: string[];
  showExtensionIcons: boolean;
  showSizeForDirectories: boolean;
  useBinarySizePrefixes: boolean;
  downloadFilesByAjax: boolean;
  previewImagesInModal: boolean;
  enablePermissionsRecursive: boolean;
  compressAsync: boolean;
  extractAsync: boolean;
  hideSize?: boolean;
  hideDate?: boolean;
  hidePermissions?: boolean;
  pickCallback?: ((item: FileModel & { fullPath: () => string }) => boolean | void) | null;
  isEditableFilePattern: RegExp;
  isImageFilePattern: RegExp;
  isExtractableFilePattern: RegExp;
}

export type ModalType =
  | null
  | 'imagepreview'
  | 'remove'
  | 'move'
  | 'rename'
  | 'copy'
  | 'compress'
  | 'extract'
  | 'edit'
  | 'newfolder'
  | 'uploadfile'
  | 'changepermissions';

