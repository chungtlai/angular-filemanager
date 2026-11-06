import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function strLimit(input: string, limit: number, more = '...'): string {
  if (!input) return '';
  if (input.length <= limit) return input;
  return input.slice(0, limit) + more;
}

export function fileExtension(input: string): string {
  if (!input || !/\./.test(input)) return '';
  const ext = input.split('.').pop() || '';
  return strLimit(ext.toLowerCase(), 4, '..');
}

export function formatDate(input: Date | string): string {
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${input.getFullYear()}-${pad(input.getMonth() + 1)}-${pad(input.getDate())} ${pad(input.getHours())}:${pad(input.getMinutes())}:${pad(input.getSeconds())}`;
  }
  return String(input || '');
}

const decimalByteUnits = [' kB', ' MB', ' GB', ' TB', 'PB', 'EB', 'ZB', 'YB'];
const binaryByteUnits = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];

export function humanReadableFileSize(bytes: number, useBinary = false): string {
  let i = -1;
  let size = Number(bytes) || 0;
  do {
    size = size / 1024;
    i++;
  } while (size > 1024 && i < decimalByteUnits.length - 1);

  const unit = useBinary ? binaryByteUnits[i] : decimalByteUnits[i];
  return Math.max(size, 0.1).toFixed(1) + ' ' + unit;
}

