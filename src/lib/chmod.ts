import { ChmodState, RwxEntry } from '@/types/filemanager';

function emptyRwx(): RwxEntry {
  return { read: false, write: false, exec: false };
}

export function createChmod(initValue?: string | number): ChmodState {
  const state: ChmodState = {
    owner: emptyRwx(),
    group: emptyRwx(),
    others: emptyRwx(),
  };

  if (initValue !== undefined && initValue !== null && String(initValue).trim() !== '') {
    const strVal = String(initValue).trim();
    const parsed = isNaN(Number(strVal)) ? convertFromCode(strVal) : convertFromOctal(strVal);
    if (parsed) {
      return parsed;
    }
  }
  return state;
}

export function convertFromCode(str: string): ChmodState | null {
  let clean = String(str).replace(/\s/g, '');
  if (clean.length === 10) {
    clean = clean.slice(1);
  }
  if (!/^[-rwxts]{9}$/i.test(clean)) {
    return null;
  }
  const vals = clean.match(/.{1,3}/g) || [];
  const result = vals.map((chunk) => ({
    read: /r/i.test(chunk),
    write: /w/i.test(chunk),
    exec: /x|t/i.test(chunk),
  }));
  return {
    owner: result[0] || emptyRwx(),
    group: result[1] || emptyRwx(),
    others: result[2] || emptyRwx(),
  };
}

export function convertFromOctal(str: string): ChmodState | null {
  let clean = String(str).replace(/\s/g, '');
  if (clean.length === 4) {
    clean = clean.slice(1);
  }
  if (!/^[0-7]{3}$/.test(clean)) {
    return null;
  }
  const vals = clean.split('');
  const result = vals.map((digit) => ({
    read: /[4567]/.test(digit),
    write: /[2367]/.test(digit),
    exec: /[1357]/.test(digit),
  }));
  return {
    owner: result[0] || emptyRwx(),
    group: result[1] || emptyRwx(),
    others: result[2] || emptyRwx(),
  };
}

export function chmodToOctal(perms: ChmodState, prepend = '', append = ''): string {
  const keys: (keyof ChmodState)[] = ['owner', 'group', 'others'];
  const digits = keys.map((k) => {
    const rwx = perms[k];
    return (rwx.read ? 4 : 0) + (rwx.write ? 2 : 0) + (rwx.exec ? 1 : 0);
  });
  return `${prepend}${digits.join('')}${append}`;
}

export function chmodToCode(perms: ChmodState, prepend = '', append = ''): string {
  const keys: (keyof ChmodState)[] = ['owner', 'group', 'others'];
  const chunks = keys.map((k) => {
    const rwx = perms[k];
    return `${rwx.read ? 'r' : '-'}${rwx.write ? 'w' : '-'}${rwx.exec ? 'x' : '-'}`;
  });
  return `${prepend}${chunks.join('')}${append}`;
}

export function cloneChmod(perms: ChmodState): ChmodState {
  return {
    owner: { ...perms.owner },
    group: { ...perms.group },
    others: { ...perms.others },
  };
}

