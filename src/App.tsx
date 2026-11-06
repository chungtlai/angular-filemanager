import React from 'react';
import { FileManager } from '@/components/FileManager/FileManager';

export function App() {
  return (
    <FileManager
      config={{
        appName: 'angular-filemanager',
        pickCallback: (item) => {
          const msg = `Picked ${item.type} "${item.fullPath()}" for external use`;
          window.alert(msg);
        },
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
      }}
    />
  );
}

export default App;

