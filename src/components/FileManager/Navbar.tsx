import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  FolderPlus,
  Globe,
  HardDrive,
  LayoutGrid,
  List,
  MoreVertical,
  RefreshCw,
  Search,
  UploadCloud,
  X,
} from 'lucide-react';
import type { FileManagerConfig, StorageBackend } from '@/types/filemanager';
import { AVAILABLE_LANGUAGES } from '@/i18n/useTranslation';
import { strLimit } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavbarProps {
  config: FileManagerConfig;
  currentPath: string[];
  query: string;
  onQueryChange: (q: string) => void;
  storageBackend: StorageBackend;
  onStorageBackendChange: (backend: StorageBackend) => void;
  viewMode: 'icons' | 'table';
  onViewModeChange: (mode: 'icons' | 'table') => void;
  language: string;
  onLanguageChange: (lang: string) => void;
  onGoTo: (index: number) => void;
  onUpDir: () => void;
  onRefresh: () => void;
  onOpenNewFolder: () => void;
  onOpenUpload: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const Navbar: React.FC<NavbarProps> = ({
  config,
  currentPath,
  query,
  onQueryChange,
  storageBackend,
  onStorageBackendChange,
  viewMode,
  onViewModeChange,
  language,
  onLanguageChange,
  onGoTo,
  onUpDir,
  onRefresh,
  onOpenNewFolder,
  onOpenUpload,
  t,
}) => {
  const [searchOpen, setSearchOpen] = useState(false);

  const currentFolderName = currentPath.slice(-1)[0] || '/';

  return (
    <header className="sticky top-0 z-30 border-b bg-primary text-primary-foreground shadow-sm">
      <div className="flex h-14 items-center justify-between px-4 gap-3">
        {/* Left: Mobile Up button or Desktop Breadcrumb */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {currentPath.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onUpDir}
              className="sm:hidden text-primary-foreground hover:bg-white/15 shrink-0"
              title={t('go_back')}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          <span className="sm:hidden font-medium truncate">
            {strLimit(currentFolderName, 16)}
          </span>

          {!config.breadcrumb ? (
            <span className="hidden sm:inline-block text-lg font-semibold tracking-tight">
              {config.appName || t('filemanager')}
            </span>
          ) : (
            <nav aria-label="Breadcrumb" className="hidden sm:flex items-center flex-wrap gap-1 text-sm">
              <button
                type="button"
                onClick={() => onGoTo(-1)}
                className="rounded px-2 py-1 font-semibold hover:bg-white/15 transition-colors"
              >
                {t('filemanager')}
              </button>
              {currentPath.map((dir, index) => {
                const isLast = index === currentPath.length - 1;
                return (
                  <React.Fragment key={`${dir}-${index}`}>
                    <ChevronRight className="h-4 w-4 opacity-70 shrink-0" />
                    {isLast ? (
                      <span className="rounded bg-white/20 px-2 py-1 font-medium">
                        {strLimit(dir, 18)}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onGoTo(index)}
                        className="rounded px-2 py-1 hover:bg-white/15 transition-colors opacity-90 hover:opacity-100"
                      >
                        {strLimit(dir, 14)}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </nav>
          )}
        </div>

        {/* Right: Storage Backend Switcher, Search, View Switcher, Language, More Menu */}
        <div className="flex items-center gap-1.5">
          <div
            className="flex items-center rounded-md bg-black/20 p-0.5 text-xs"
            role="group"
            aria-label="Storage backend"
          >
            <button
              type="button"
              onClick={() => onStorageBackendChange('local')}
              className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
                storageBackend === 'local'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-primary-foreground/85 hover:text-primary-foreground hover:bg-white/10'
              }`}
              title="Local File System"
            >
              <HardDrive className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Local FS</span>
            </button>
            <button
              type="button"
              onClick={() => onStorageBackendChange('minio')}
              className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
                storageBackend === 'minio'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-primary-foreground/85 hover:text-primary-foreground hover:bg-white/10'
              }`}
              title="MinIO Object Storage"
            >
              <Cloud className="h-3.5 w-3.5" />
              <span className="hidden md:inline">MinIO</span>
            </button>
          </div>

          {config.searchForm && (
            <div className="relative flex items-center">
              {searchOpen || query ? (
                <div className="flex items-center bg-white/15 rounded-md px-2 py-0.5">
                  <Search className="h-4 w-4 text-primary-foreground/80 mr-1.5 shrink-0" />
                  <Input
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    placeholder={`${t('search')}...`}
                    className="h-7 w-36 sm:w-48 border-0 bg-transparent text-primary-foreground placeholder:text-primary-foreground/70 focus-visible:ring-0 px-1 text-xs"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onQueryChange('');
                      setSearchOpen(false);
                    }}
                    className="p-0.5 hover:bg-white/20 rounded"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchOpen(true)}
                  className="text-primary-foreground hover:bg-white/15"
                  title={t('search')}
                >
                  <Search className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            className="text-primary-foreground hover:bg-white/15"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>

          {viewMode !== 'icons' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onViewModeChange('icons')}
              className="text-primary-foreground hover:bg-white/15"
              title={t('icons')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          )}

          {viewMode !== 'table' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onViewModeChange('table')}
              className="text-primary-foreground hover:bg-white/15"
              title={t('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          )}

          {config.multiLang && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-primary-foreground hover:bg-white/15"
                  title={t('language')}
                >
                  <Globe className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                {AVAILABLE_LANGUAGES.map((lang) => (
                  <DropdownMenuItem
                    key={lang.code}
                    onClick={() => onLanguageChange(lang.code)}
                    className={language === lang.code ? 'bg-accent font-semibold' : ''}
                  >
                    {lang.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {(config.allowedActions.createFolder || config.allowedActions.upload) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-primary-foreground hover:bg-white/15"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {config.allowedActions.createFolder && (
                  <DropdownMenuItem onClick={onOpenNewFolder}>
                    <FolderPlus className="h-4 w-4 text-primary" />
                    <span>{t('new_folder')}</span>
                  </DropdownMenuItem>
                )}
                {config.allowedActions.upload && (
                  <DropdownMenuItem onClick={onOpenUpload}>
                    <UploadCloud className="h-4 w-4 text-primary" />
                    <span>{t('upload_files')}</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
};

