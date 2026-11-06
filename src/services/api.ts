import { RawFileModel } from '@/types/filemanager';

interface ApiResponse<T = unknown> {
  result?: T;
  error?: { message?: string } | string;
}

interface ActionResult {
  success: boolean;
  error: string | null;
}

function parseApiError(data: unknown, status: number, fallbackMsg: string): string | null {
  if (status === 404) {
    return 'Error 404 - Backend bridge is not working, please check the ajax response.';
  }
  if (!data || typeof data !== 'object') {
    return `Error ${status} - Bridge response error, please check the API docs or this ajax response.`;
  }
  const obj = data as Record<string, any>;
  if (obj.result && typeof obj.result === 'object' && obj.result.error) {
    return String(obj.result.error);
  }
  if (obj.error) {
    if (typeof obj.error === 'string') return obj.error;
    if (typeof obj.error.message === 'string') return obj.error.message;
  }
  if (status >= 400) {
    return fallbackMsg || `HTTP Error ${status}`;
  }
  return null;
}

async function postJson<T>(url: string, payload: Record<string, unknown>, defaultErrorMsg: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    throw new Error(err?.message || defaultErrorMsg);
  }

  let data: ApiResponse<T> | null = null;
  try {
    data = await response.json();
  } catch {
    throw new Error(parseApiError(null, response.status, defaultErrorMsg) || defaultErrorMsg);
  }

  const errMsg = parseApiError(data, response.status, defaultErrorMsg);
  if (errMsg) {
    throw new Error(errMsg);
  }
  return data?.result as T;
}

export const fileManagerApi = {
  async list(apiUrl: string, path: string, onlyFolders = false, exts?: string[]): Promise<RawFileModel[]> {
    // Support static JSON demo url (e.g. listing-response-example.json) via GET fallback if ending in .json
    if (apiUrl.endsWith('.json')) {
      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error(`Error ${res.status} loading ${apiUrl}`);
      const json = await res.json();
      const list = (json.result || []) as RawFileModel[];
      return onlyFolders ? list.filter((i) => i.type === 'dir') : list;
    }

    const payload: Record<string, unknown> = {
      action: 'list',
      path,
    };
    if (onlyFolders) {
      payload.onlyFolders = 'true';
    }
    if (exts && exts.length > 0) {
      payload.fileExtensions = exts;
    }
    const result = await postJson<RawFileModel[]>(
      apiUrl,
      payload,
      'Unknown error listing, check the response'
    );
    return Array.isArray(result) ? result : [];
  },

  async copy(apiUrl: string, items: string[], newPath: string, singleFilename?: string, errMsg = 'Error copying'): Promise<ActionResult> {
    const payload: Record<string, unknown> = {
      action: 'copy',
      items,
      newPath,
    };
    if (singleFilename && items.length === 1) {
      payload.singleFilename = singleFilename;
    }
    return postJson<ActionResult>(apiUrl, payload, errMsg);
  },

  async move(apiUrl: string, items: string[], newPath: string, errMsg = 'Error moving'): Promise<ActionResult> {
    return postJson<ActionResult>(
      apiUrl,
      {
        action: 'move',
        items,
        newPath,
      },
      errMsg
    );
  },

  async remove(apiUrl: string, items: string[], errMsg = 'Error deleting'): Promise<ActionResult> {
    return postJson<ActionResult>(
      apiUrl,
      {
        action: 'remove',
        items,
      },
      errMsg
    );
  },

  async rename(apiUrl: string, item: string, newItemPath: string, errMsg = 'Error renaming'): Promise<ActionResult> {
    return postJson<ActionResult>(
      apiUrl,
      {
        action: 'rename',
        item,
        newItemPath,
      },
      errMsg
    );
  },

  async getContent(apiUrl: string, item: string, errMsg = 'Error getting content'): Promise<string> {
    return postJson<string>(
      apiUrl,
      {
        action: 'getContent',
        item,
      },
      errMsg
    );
  },

  async edit(apiUrl: string, item: string, content: string, errMsg = 'Error modifying'): Promise<ActionResult> {
    return postJson<ActionResult>(
      apiUrl,
      {
        action: 'edit',
        item,
        content,
      },
      errMsg
    );
  },

  async createFolder(apiUrl: string, newPath: string, errMsg = 'Error creating folder'): Promise<ActionResult> {
    return postJson<ActionResult>(
      apiUrl,
      {
        action: 'createFolder',
        newPath,
      },
      errMsg
    );
  },

  async changePermissions(
    apiUrl: string,
    items: string[],
    permsCode: string,
    permsOctal: string,
    recursive: boolean,
    errMsg = 'Error changing permissions'
  ): Promise<ActionResult> {
    return postJson<ActionResult>(
      apiUrl,
      {
        action: 'changePermissions',
        items,
        perms: permsCode,
        permsCode: permsOctal,
        recursive: !!recursive,
      },
      errMsg
    );
  },

  async compress(
    apiUrl: string,
    items: string[],
    compressedFilename: string,
    destination: string,
    errMsg = 'Error compressing'
  ): Promise<ActionResult> {
    return postJson<ActionResult>(
      apiUrl,
      {
        action: 'compress',
        items,
        destination,
        compressedFilename,
      },
      errMsg
    );
  },

  async extract(
    apiUrl: string,
    item: string,
    folderName: string,
    destination: string,
    errMsg = 'Error extracting'
  ): Promise<ActionResult> {
    return postJson<ActionResult>(
      apiUrl,
      {
        action: 'extract',
        item,
        destination,
        folderName,
      },
      errMsg
    );
  },

  upload(
    apiUrl: string,
    destination: string,
    files: File[],
    onProgress?: (percent: number) => void
  ): Promise<ActionResult> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('destination', destination);
      files.forEach((file, idx) => {
        formData.append(`file-${idx}`, file);
      });

      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiUrl, true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const pct = Math.min(100, Math.floor((100 * evt.loaded) / evt.total));
            onProgress(pct);
          }
        };
      }

      xhr.onload = () => {
        let data: any = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          // ignore
        }
        const err = parseApiError(data, xhr.status, 'Unknown error uploading files');
        if (err) {
          reject(new Error(err));
        } else {
          resolve(data?.result || { success: true, error: null });
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error uploading files'));
      };

      xhr.send(formData);
    });
  },

  getDownloadUrl(apiUrl: string, path: string, preview = false): string {
    const params = new URLSearchParams({
      action: 'download',
      path,
    });
    if (preview) {
      params.set('preview', 'true');
    }
    return `${apiUrl}?${params.toString()}`;
  },

  async download(apiUrl: string, itemPath: string, toFilename: string, downloadByAjax = true): Promise<void> {
    const url = this.getDownloadUrl(apiUrl, itemPath);
    if (!downloadByAjax) {
      window.open(url, '_blank');
      return;
    }
    const response = await fetch(url, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`);
    }
    const blob = await response.blob();
    triggerBrowserDownload(blob, toFilename);
  },

  async downloadMultiple(
    apiUrl: string,
    items: string[],
    toFilename: string,
    downloadByAjax = true
  ): Promise<void> {
    const params = new URLSearchParams();
    params.set('action', 'downloadMultiple');
    params.set('toFilename', toFilename);
    items.forEach((item) => params.append('items[]', item));
    const url = `${apiUrl}?${params.toString()}`;

    if (!downloadByAjax) {
      window.open(url, '_blank');
      return;
    }
    const response = await fetch(url, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!response.ok) {
      throw new Error(`Multi-download failed (${response.status})`);
    }
    const blob = await response.blob();
    triggerBrowserDownload(blob, toFilename);
  },
};

function triggerBrowserDownload(blob: Blob, filename: string) {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}

