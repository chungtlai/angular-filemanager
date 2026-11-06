import { FileManagerConfig } from '@/types/filemanager';

const HANDLER_URL = 'bridges/php/handler.php';

export const defaultConfig: FileManagerConfig = {
  appName: 'angular-filemanager v2.0',
  defaultLang: 'en',
  multiLang: true,

  listUrl: HANDLER_URL,
  uploadUrl: HANDLER_URL,
  renameUrl: HANDLER_URL,
  copyUrl: HANDLER_URL,
  moveUrl: HANDLER_URL,
  removeUrl: HANDLER_URL,
  editUrl: HANDLER_URL,
  getContentUrl: HANDLER_URL,
  createFolderUrl: HANDLER_URL,
  downloadFileUrl: HANDLER_URL,
  downloadMultipleUrl: HANDLER_URL,
  compressUrl: HANDLER_URL,
  extractUrl: HANDLER_URL,
  permissionsUrl: HANDLER_URL,
  basePath: '/',

  searchForm: true,
  sidebar: true,
  breadcrumb: true,
  allowedActions: {
    upload: true,
    rename: true,
    move: true,
    copy: true,
    edit: true,
    changePermissions: true,
    compress: true,
    compressChooseName: true,
    extract: true,
    download: true,
    downloadMultiple: true,
    preview: true,
    remove: true,
    createFolder: true,
    pickFiles: false,
    pickFolders: false,
  },

  multipleDownloadFileName: 'angular-filemanager.zip',
  filterFileExtensions: [],
  showExtensionIcons: true,
  showSizeForDirectories: false,
  useBinarySizePrefixes: false,
  downloadFilesByAjax: true,
  previewImagesInModal: true,
  enablePermissionsRecursive: true,
  compressAsync: false,
  extractAsync: false,
  pickCallback: null,

  isEditableFilePattern:
    /\.(txt|diff?|patch|svg|asc|cnf|cfg|conf|html?|.html|cfm|cgi|aspx?|ini|pl|py|md|css|cs|js|jsp|log|htaccess|htpasswd|gitignore|gitattributes|env|json|atom|eml|rss|markdown|sql|xml|xslt?|sh|rb|as|bat|cmd|cob|for|ftn|frm|frx|inc|lisp|scm|coffee|php[3-6]?|java|c|cbl|go|h|scala|vb|tmpl|lock|go|yml|yaml|tsv|lst|tsx?)$/i,
  isImageFilePattern: /\.(jpe?g|gif|bmp|png|svg|tiff?|webp)$/i,
  isExtractableFilePattern: /\.(gz|tar|rar|g?zip)$/i,
};

