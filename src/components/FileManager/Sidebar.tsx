import React from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { FileItem, TreeNode } from '@/types/filemanager';
import { cn, strLimit } from '@/lib/utils';

interface SidebarProps {
  history: TreeNode[];
  currentPath: string[];
  basePath: string[];
  onFolderClick: (item: FileItem | null) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  history,
  currentPath,
  basePath,
  onFolderClick,
}) => {
  const currentJoined = currentPath.join('/');

  const isInThisPath = (nodeName: string) => {
    if (!nodeName) return true;
    const currentWithSlash = currentJoined + '/';
    return currentWithSlash.indexOf(nodeName + '/') !== -1;
  };

  const renderNode = (node: TreeNode, depth = 0) => {
    const isActive = node.name === currentJoined;
    const isExpanded = isInThisPath(node.name);
    const label =
      node.name.split('/').pop() || basePath.join('/') || '/';

    return (
      <li key={node.name || '__root__'} className="select-none">
        <button
          type="button"
          onClick={() => onFolderClick(node.item)}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          className={cn(
            'flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
            isActive && 'bg-primary/10 font-semibold text-primary'
          )}
        >
          { isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-amber-500" />
          )}
          <span className="truncate">{strLimit(label, 28)}</span>
        </button>

        {node.nodes && node.nodes.length > 0 && (
          <ul className="mt-0.5 space-y-0.5">
            {node.nodes.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  if (!history.length) return null;

  return (
    <aside className="w-full sm:w-64 md:w-72 shrink-0 border-r bg-slate-50/60 p-3 overflow-y-auto">
      <ul className="space-y-0.5">{history.map((rootNode) => renderNode(rootNode, 0))}</ul>
    </aside>
  );
};

